/**
 * SECURITY: verify_jwt = false
 * Reason: public in-app support chat; reuses the discover-chat pattern (CORS +
 *   persistent rate limit + optional bearer auth). Core support is available to
 *   all tiers, so auth is optional — an authenticated user is attached when present.
 * Risk level: LOW (grounded KB answers; unresolved chats create a support ticket).
 *
 * support-chat (AOS-CS-006) — in-app support chat wired to the first-responder.
 * Grounds replies in the KB (AOS-CS-003); when it can't resolve, or the user asks
 * for a human, it opens a support_ticket (channel in_app), attaches the full
 * transcript, and escalates to tier-2.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { checkRateLimitPersistent, addRateLimitHeaders } from "../_shared/rateLimit.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { createAgentTask } from "../_shared/agentTasks.ts";
import { writeAgentAudit } from "../_shared/auditLog.ts";
import { retrieveKb } from "../_shared/kbRetrieve.ts";
import { getAIConfig, getAnthropicApiKey, lightweightModel, shapeClaudeRequest } from "../_shared/aiConfig.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { crisisMessageText, crisisPayload, detectCrisisIntent } from "../_shared/crisisSupport.ts";
import { anthropicCostUsd } from "../_shared/providerUsage.ts";
import { capHistory, transcriptRows, type Msg } from "./history.ts";
import { guardAi, type QuotaClient } from "../_shared/aiQuota.ts";
import { resolveEntitledTier } from "../_shared/entitlements.ts";

const AGENT_KEY = "support-chat";
const HUMAN_RE = /\b(speak|talk|connect|escalate|transfer)\b.{0,20}\b(human|person|agent|representative|rep|someone|support team)\b|\bhuman\b.{0,10}\bplease\b/i;

// deno-lint-ignore no-explicit-any
type Client = any;

function j(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

async function draft(supabaseUrl: string, supabaseKey: string, history: Msg[], passages: { title: string; content: string; source: string | null }[]) {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) return null;
  const config = await getAIConfig(supabaseUrl, supabaseKey);
  const context = passages.map((p, i) => `[${i + 1}] (${p.source ?? "KB"}) ${p.title}\n${p.content}`).join("\n\n");
  const system =
    `You are the friendly in-app support assistant for Des Moines Insider. ` +
    `Answer USING ONLY the knowledge-base passages provided. If they don't clearly contain the answer, ` +
    `set "canAnswer" to false and offer to connect the user with a human. Cite sources you used. ` +
    `Return ONLY compact JSON: {"reply":"...","canAnswer":true|false,"sources":["label"...]}.\n\nKNOWLEDGE BASE:\n${context || "(none)"}`;
  const model = lightweightModel();
  try {
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": config.anthropic_version },
      body: JSON.stringify(shapeClaudeRequest({ model, max_tokens: 700, temperature: 0.2, system, messages: history.slice(-8) }, { lightweight: true })),
      signal: AbortSignal.timeout(30_000),
    }, 60_000);
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = (data.content ?? []).map((b: { text?: string }) => b.text ?? "").join("");
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const usage = data.usage ?? {};
    const costUsd = anthropicCostUsd(model, usage);
    return {
      reply: String(parsed.reply ?? "").slice(0, 4000),
      canAnswer: parsed.canAnswer === true,
      sources: Array.isArray(parsed.sources) ? parsed.sources.slice(0, 8).map((s: unknown) => String(s)) : [],
      costUsd,
    };
  } catch {
    return null;
  }
}

// Tickets an anonymous caller may open per UTC day, per IP. "Talk to a human"
// skips the AI quota (it never calls the model), so before this the only bound
// on ticket inserts was the 15-per-15-minutes request limit: about 1,400 a day
// from one address. Signed-in users are not counted here. The window fits the
// rate-limit cleanup, which keeps rows for a day after created_at.
const ANON_TICKET_LIMIT = {
  endpoint: "support-chat-ticket",
  windowMs: 24 * 60 * 60 * 1000,
  max: 5,
  message: "You've opened the most support tickets allowed today without signing in. Please sign in, or use the contact form.",
};

const ANON_TICKET_CAP_REPLY =
  "I couldn't open another ticket from this connection today. Please sign in, or send us a message through the contact form, and a person will follow up.";

/** Counts one anonymous ticket; returns the denial when the day's cap is spent, else null. */
async function anonTicketDenied(req: Request, userId: string | null) {
  if (userId) return null;
  const rl = await checkRateLimitPersistent(req, ANON_TICKET_LIMIT);
  return rl.success ? null : rl;
}

async function openTicket(
  supabase: Client,
  userId: string | null,
  history: Msg[],
  reason: string,
  serverReply?: string | null,
): Promise<string | null> {
  const first = history.find((m) => m.role === "user")?.content ?? "In-app support chat";
  const { data: ticket } = await supabase
    .from("support_tickets")
    .insert({ user_id: userId, channel: "in_app", subject: `In-app chat: ${first.slice(0, 80)}`, body: first, status: "escalated", category: "general" })
    .select("id")
    .single();
  const ticketId = ticket?.id ?? null;
  if (ticketId) {
    // Attach the transcript: the user's turns, plus the reply this request
    // generated. Client-supplied assistant turns are not stored (history.ts).
    const rows = transcriptRows(ticketId, history, serverReply);
    if (rows.length) await supabase.from("support_messages").insert(rows);
    await createAgentTask(supabase, {
      agentKey: AGENT_KEY,
      category: "support",
      title: `In-app chat needs a human — ${reason}`,
      confidence: 0,
      forceTier: 2,
      dedupeKey: `support-ticket:${ticketId}`,
      payload: { ticketId, reason, channel: "in_app" },
    });
    await writeAgentAudit(supabase, { agentKey: AGENT_KEY, actionType: "support_chat_escalation", targetRef: `support_tickets:${ticketId}`, after: { reason } });
  }
  return ticketId;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405, corsHeaders);

  // Anti-abuse rate limit (same pattern as discover-chat).
  const rl = await checkRateLimitPersistent(req, { endpoint: "support-chat", windowMs: 15 * 60 * 1000, max: 15, message: "Too many support requests. Please slow down." });
  if (!rl.success && rl.response) return addRateLimitHeaders(rl.response, rl);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase: Client = createClient(supabaseUrl, supabaseKey);

  // Optional auth — core support is available to all tiers.
  let userId: string | null = null;
  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const { data } = await supabase.auth.getUser(authHeader.slice(7)).catch(() => ({ data: { user: null } }));
    userId = data?.user?.id ?? null;
  }

  const body = await req.json().catch(() => ({}));
  const history: Msg[] = capHistory(body.messages);
  const wantsHuman = body.talkToHuman === true;
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  if (history.length === 0 && !wantsHuman) return j({ error: "messages required" }, 400, corsHeaders);

  // Crisis check (WEB-LEGAL-005). Before runAgent, so no model call, no KB
  // retrieval, no ticket and no agent ledger entry: a distressed message must
  // not sit in a support queue waiting for a human who may be hours away. The
  // reply is static and returned immediately. Nothing about it is stored.
  if (detectCrisisIntent(lastUser)) {
    return j(
      { ok: true, escalated: false, reply: crisisMessageText(), sources: [], ...crisisPayload() },
      200,
      corsHeaders,
    );
  }

  // Daily quota (plan WP1). An explicit "talk to a human" request never calls
  // the model, so only the drafting path is metered. Denial is a 429 rather
  // than an escalation: an over-quota caller must not be able to fill the
  // ticket queue instead.
  const wantsHumanNow = wantsHuman || HUMAN_RE.test(lastUser);
  let settleAi: ((costUsd: number) => Promise<void>) | null = null;
  if (!wantsHumanNow) {
    const tier = userId ? await resolveEntitledTier(supabase, userId) : "anon";
    const guard = await guardAi(supabase as QuotaClient, req, {
      feature: "support-chat",
      provider: "anthropic",
      tier,
      userId,
      headers: corsHeaders,
    });
    if (!guard.ok) return guard.response;
    settleAi = (costUsd) => guard.settle({ costUsd });
  } else {
    // A 429, like the AI quota above and the request limit: useSupportChat
    // treats it as a failed call and offers the contact form.
    const denied = await anonTicketDenied(req, userId);
    if (denied) {
      return denied.response
        ? addRateLimitHeaders(denied.response, denied)
        : j({ error: ANON_TICKET_LIMIT.message }, 429, corsHeaders);
    }
  }

  const ledger = await runAgent(AGENT_KEY, async (ctx) => {
    // Explicit "talk to a human" (button or phrasing) → escalate immediately.
    if (wantsHumanNow) {
      const ticketId = await openTicket(supabase, userId, history, "user requested a human");
      ctx.escalated(1);
      ctx.summary("in-app chat escalated (human requested)");
      return { escalated: true, ticketId, reply: "I've connected you with our support team — they'll follow up on this ticket. Is there anything else I can help with in the meantime?", sources: [] };
    }

    // Grounded retrieval + draft.
    let passages: { title: string; content: string; source: string | null; similarity: number }[] = [];
    try {
      const r = await retrieveKb(supabase, lastUser, { matchCount: 5, threshold: 0.5 });
      passages = r.passages;
      ctx.tokens(r.tokens);
      ctx.cost(r.costUsd);
    } catch { /* retrieval down → low confidence */ }

    const d = await draft(supabaseUrl, supabaseKey, history, passages);
    if (d) {
      ctx.cost(d.costUsd);
      if (settleAi) await settleAi(d.costUsd);
    }

    if (!d || !d.canAnswer) {
      // The model has already answered and been paid for, so a spent ticket
      // cap returns that answer un-escalated instead of a 429.
      if (await anonTicketDenied(req, userId)) {
        ctx.processed(1);
        ctx.summary("in-app chat unresolved; anonymous daily ticket cap reached");
        return { escalated: false, ticketId: null, reply: ANON_TICKET_CAP_REPLY, sources: d?.sources ?? [] };
      }
      const ticketId = await openTicket(
        supabase,
        userId,
        history,
        !d ? "assistant unavailable" : "could not resolve from KB",
        d?.reply || null,
      );
      ctx.escalated(1);
      ctx.summary("in-app chat escalated (unresolved)");
      return {
        escalated: true,
        ticketId,
        reply: d?.reply || "I'm not fully sure on that one — I've opened a ticket so a person can help. You'll hear back soon.",
        sources: d?.sources ?? [],
      };
    }

    ctx.processed(1);
    ctx.summary("in-app chat answered from KB");
    return { escalated: false, reply: d.reply, sources: d.sources };
  });

  return j({ ok: ledger.ok, ...(ledger.result ?? { reply: "Sorry, something went wrong.", sources: [] }) }, ledger.ok ? 200 : 500, corsHeaders);
});
