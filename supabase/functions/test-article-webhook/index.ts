/**
 * SECURITY: admin or API key only (requireAdminOrApiKey), AND the target URL is
 *   SSRF-validated before anything is sent. This function POSTs to a URL the
 *   caller supplies, which is the textbook server-side request forgery shape -
 *   without the guard an admin session could be used to reach the project's own
 *   internal endpoints from inside the network.
 * Risk level: MEDIUM-HIGH, entirely because of the caller-supplied URL.
 *
 * test-article-webhook (XPLAT-008) - the "Send test" button in
 * ArticleWebhookConfig.
 *
 * WHY THIS EXISTS NOW. ArticleWebhookConfig.tsx:88 has invoked this function
 * since it was written and no such function existed, so the button returned a
 * 404 every time and reported "Webhook test failed: ...". An admin could not
 * tell a wrong Make.com URL from a missing endpoint - and the entire purpose of
 * the button is to answer exactly that question.
 *
 * It sends a payload shaped like a real article event, because a test that
 * sends something different from production proves the wrong thing.
 */
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { validateURLForSSRF } from "../_shared/validation.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

const TIMEOUT_MS = 10_000;

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
  const webhookUrl = typeof body.webhookUrl === "string" ? body.webhookUrl.trim() : "";
  if (!webhookUrl) return json({ success: false, error: "A webhook URL is required." }, 400);

  // https only: a webhook carries article content to a third party, and this
  // runs server-side where a plaintext hop is invisible to whoever configured it.
  const ssrf = validateURLForSSRF(webhookUrl, {
    allowedProtocols: ["https:"],
    blockPrivateIPs: true,
  });
  if (!ssrf.valid) {
    return json({ success: false, error: `Refusing that URL: ${ssrf.error}` }, 400);
  }

  // Deliberately shaped like a real article event, and deliberately marked as a
  // test so a live Make.com scenario can branch on it rather than publishing a
  // fake article.
  const payload = {
    test: true,
    event: "article.published",
    sentAt: new Date().toISOString(),
    article: {
      id: "00000000-0000-0000-0000-000000000000",
      title: "Test article from Des Moines Insider",
      slug: "test-article",
      category: "Test",
      summary: "This is a test delivery. No article was published.",
      url: "https://desmoinesinsider.com/articles/test-article",
    },
  };

  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(
      webhookUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      TIMEOUT_MS,
    );
    const elapsedMs = Date.now() - startedAt;

    if (!response.ok) {
      // The receiving end's status is the answer the admin came for.
      return json({
        success: false,
        error: `The webhook responded ${response.status} ${response.statusText}`.trim(),
        status: response.status,
        elapsedMs,
      });
    }

    return json({ success: true, status: response.status, elapsedMs });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : "The webhook could not be reached.",
      elapsedMs: Date.now() - startedAt,
    });
  }
});
