/**
 * SECURITY: verify_jwt = false
 * Reason: cron control-plane job; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: LOW (classifies tickets + sets priority/SLA; opens escalation
 *   tasks — no user-facing sends, no destructive writes).
 *
 * agent-ticket-classifier (AOS-CS-005) — sentiment/urgency/priority + SLA.
 *
 * Two passes each run:
 *  1. Classify unclassified tickets (sentiment, urgency, category) via the LLM,
 *     derive priority + sla_due_at, and fast-track negative/high-urgency ones.
 *  2. SLA-breach guard: fast-track tickets approaching their sla_due_at while
 *     still unhandled are pre-escalated to a tier-2 task BEFORE the breach.
 * Classification is stored on the ticket (visible in the console); human
 * corrections are captured separately (support-ticket-reclassify).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { createAgentTask } from "../_shared/agentTasks.ts";
import { getAIConfig, getAnthropicApiKey } from "../_shared/aiConfig.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

const AGENT_KEY = "ticket-classifier";
const BATCH = 20;

// SLA hours by priority (fast-track = shorter).
const SLA_HOURS: Record<string, number> = { urgent: 2, high: 8, normal: 24, low: 72 };
// Pre-escalate this long before the SLA is actually breached.
const PRE_ESCALATE_BUFFER_MS = 30 * 60 * 1000;

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

interface Classification {
  sentiment: "positive" | "neutral" | "negative";
  urgency: "low" | "medium" | "high" | "critical";
  category: string;
  confidence: number;
}

// Priority is derived from urgency, then bumped for negative sentiment.
function derivePriority(c: Classification): string {
  let p = c.urgency === "critical" ? "urgent" : c.urgency === "high" ? "high" : c.urgency === "medium" ? "normal" : "low";
  if (c.sentiment === "negative") {
    if (p === "low") p = "normal";
    else if (p === "normal") p = "high";
    else if (p === "high") p = "urgent";
  }
  return p;
}

async function classify(supabaseUrl: string, supabaseKey: string, subject: string, bodyText: string): Promise<{ c: Classification; costUsd: number } | null> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) return null;
  const config = await getAIConfig(supabaseUrl, supabaseKey);
  const prompt =
    `Classify this support ticket for a city-guide platform. Return ONLY compact JSON: ` +
    `{"sentiment":"positive|neutral|negative","urgency":"low|medium|high|critical","category":"billing|account|content|technical|feedback|general","confidence":0..1}.\n\n` +
    `SUBJECT: ${subject}\nBODY: ${bodyText.slice(0, 1500)}`;
  try {
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": config.anthropic_version },
      body: JSON.stringify({ model: config.lightweight_model, max_tokens: 200, temperature: 0, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(20_000),
    }, 60_000);
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = (data.content ?? []).map((b: { text?: string }) => b.text ?? "").join("");
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const usage = data.usage ?? {};
    const costUsd = (usage.input_tokens ?? 0) * (0.8 / 1_000_000) + (usage.output_tokens ?? 0) * (4 / 1_000_000);
    const c: Classification = {
      sentiment: ["positive", "neutral", "negative"].includes(parsed.sentiment) ? parsed.sentiment : "neutral",
      urgency: ["low", "medium", "high", "critical"].includes(parsed.urgency) ? parsed.urgency : "low",
      category: String(parsed.category ?? "general").slice(0, 40),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
    };
    return { c, costUsd };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders);

  const authError = await requireAdminOrApiKey(req, corsHeaders);
  if (authError) return authError;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase: Client = createClient(supabaseUrl, supabaseKey);

  const ledger = await runAgent(AGENT_KEY, async (ctx) => {
    const nowMs = Date.now();
    let classified = 0;
    let preEscalated = 0;
    let cost = 0;

    // ── 1) Classify unclassified tickets ─────────────────────────────────
    const { data: unclassified } = await supabase
      .from("support_tickets")
      .select("id, subject, body")
      .is("classified_at", null)
      .not("status", "in", "(resolved,closed)")
      .order("created_at", { ascending: true })
      .limit(BATCH);

    for (const t of (unclassified ?? []) as { id: string; subject: string | null; body: string }[]) {
      const result = await classify(supabaseUrl, supabaseKey, t.subject ?? "", t.body);
      if (!result) continue;
      cost += result.costUsd;
      const priority = derivePriority(result.c);
      const slaHours = SLA_HOURS[priority] ?? 24;
      const slaDueAt = new Date(nowMs + slaHours * 60 * 60 * 1000).toISOString();
      await supabase
        .from("support_tickets")
        .update({
          sentiment: result.c.sentiment,
          urgency: result.c.urgency,
          category: result.c.category,
          priority,
          sla_due_at: slaDueAt,
          classified_at: new Date().toISOString(),
          classification_confidence: result.c.confidence,
          classification_source: "agent",
          updated_at: new Date().toISOString(),
        })
        .eq("id", t.id);
      classified++;
    }

    // ── 2) SLA-breach guard: pre-escalate unhandled fast-track tickets ────
    const breachSoon = new Date(nowMs + PRE_ESCALATE_BUFFER_MS).toISOString();
    const { data: atRisk } = await supabase
      .from("support_tickets")
      .select("id, subject, priority, sla_due_at, sentiment, urgency")
      .not("sla_due_at", "is", null)
      .lte("sla_due_at", breachSoon)
      .is("sla_escalated_at", null)
      .in("status", ["new", "ai_handling", "awaiting_user"])
      .limit(BATCH);

    for (const t of (atRisk ?? []) as { id: string; subject: string | null; priority: string; sla_due_at: string; sentiment: string | null; urgency: string | null }[]) {
      const task = await createAgentTask(supabase, {
        agentKey: AGENT_KEY,
        category: "support",
        title: `SLA at risk: ${t.subject ?? "(no subject)"} (${t.priority}, due ${t.sla_due_at.slice(0, 16)})`,
        confidence: 0,
        forceTier: t.priority === "urgent" || t.sentiment === "negative" ? 3 : 2,
        dedupeKey: `sla-risk:${t.id}`,
        payload: { ticketId: t.id, priority: t.priority, slaDueAt: t.sla_due_at, sentiment: t.sentiment, urgency: t.urgency },
      });
      if (task.ok) {
        await supabase.from("support_tickets").update({ sla_escalated_at: new Date().toISOString(), status: "escalated" }).eq("id", t.id);
        preEscalated++;
        ctx.escalated(1);
      }
    }

    ctx.cost(cost);
    ctx.processed(classified + preEscalated);
    ctx.summary(`classified ${classified}, pre-escalated ${preEscalated} before SLA; $${cost.toFixed(5)}`);
    ctx.meta({ classified, preEscalated, cost });
    return { classified, preEscalated };
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
