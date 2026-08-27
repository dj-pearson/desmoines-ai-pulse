/**
 * SECURITY: admin or API key only (requireAdminOrApiKey). It spends model
 *   credits on demand, so an open version is a billable denial-of-wallet.
 * Risk level: MEDIUM.
 *
 * test-ai-model (XPLAT-008) - the "Test" button in AIConfigurationManager.
 *
 * WHY THIS EXISTS NOW. AIConfigurationManager.tsx:96 has invoked this function
 * since it was written, and no such function existed - so the button returned a
 * 404 on every press, surfaced as "AI model test failed". A Test button that
 * always fails is worse than no button: it makes the thing under test look
 * broken, and an admin cannot tell a genuinely misconfigured model from a
 * missing endpoint.
 *
 * It calls the model with the caller's prompt and reports what came back. That
 * is the whole point - a test that does not exercise the real path proves
 * nothing about it.
 */
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { getAnthropicApiKey, extractClaudeText } from "../_shared/aiConfig.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordAnthropicUsage } from "../_shared/providerUsage.ts";

/** Long enough for a slow first token, short enough that a hung model reports. */
const TIMEOUT_MS = 30_000;

/** A diagnostic never needs a long answer, and tokens cost money. */
const MAX_TOKENS = 300;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const denied = await requireAdminOrApiKey(req, corsHeaders);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const testPrompt = typeof body.testPrompt === "string" ? body.testPrompt.trim() : "";

  if (!model) return json({ success: false, error: "A model is required." }, 400);
  if (!testPrompt) return json({ success: false, error: "A test prompt is required." }, 400);

  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    // Distinguishable on purpose: "no key configured" and "the model rejected
    // us" are different problems and the admin fixes them in different places.
    return json({ success: false, error: "No Anthropic API key is configured for this project." });
  }

  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_TOKENS,
          messages: [{ role: "user", content: testPrompt }],
        }),
      },
      TIMEOUT_MS,
    );

    const elapsedMs = Date.now() - startedAt;
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      // The provider's own message, not a generic one - "model not found" and
      // "credit balance too low" both arrive here and mean different things.
      const detail = payload?.error?.message ?? `HTTP ${response.status}`;
      return json({ success: false, error: detail, elapsedMs });
    }

    // AOS-MANAGE-005: a diagnostic spends real credits too, and this endpoint is
    // reachable with an API key, so "somebody is looping the Test button" is a
    // thing the budget watchdog should be able to see.
    await recordAnthropicUsage(
      createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""),
      { source: "test-ai-model", model, usage: payload?.usage ?? {} },
    );

    const extracted = extractClaudeText(payload);
    const generatedText = typeof extracted === "string" ? extracted : (extracted as { text?: string })?.text;

    if (!generatedText) {
      return json({
        success: false,
        error: "The model responded but returned no text.",
        elapsedMs,
      });
    }

    return json({ success: true, model, generatedText, elapsedMs });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Model call failed.",
      elapsedMs: Date.now() - startedAt,
    });
  }
});
