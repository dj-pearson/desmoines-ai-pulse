/**
 * agent support-responder (AOS-CS-002) — AI first-responder.
 *
 * Per unhandled ticket (latest message from the user), it:
 *   1. Guards against ping-pong (frequency/loop limits) and forced escalation
 *      (human request, or sensitive: billing/account/legal).
 *   2. Retrieves grounded KB passages (AOS-CS-003) for the question.
 *   3. Drafts an answer citing those sources; if the KB can't answer, that's
 *      low confidence → escalate.
 *   4. Runs the AOS-GOV-004 quality/safety gate before any auto-send.
 *   5. High confidence + gate pass + not sensitive → auto-send (tier-1).
 *      Otherwise → escalate to tier-2 with the suggested draft + sources.
 * Every send/escalation is written to the audit trail.
 *
 * Consolidated into `agent-runner` (was `agent-support-responder/index.ts`).
 */
import { createAgentTask } from "../agentTasks.ts";
import { writeAgentAudit } from "../auditLog.ts";
import { scoreOutput } from "../scoreOutput.ts";
import { retrieveKb, type KbPassage } from "../kbRetrieve.ts";
import { getAIConfig } from "../aiConfig.ts";
import { crisisMessageText, detectCrisisIntent } from "../crisisSupport.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "support-responder";
const BATCH = 10;
const MAX_AGENT_REPLIES = 2; // beyond this without resolution, escalate to a human
const HIGH_CONFIDENCE_SIM = 0.75; // top KB similarity to auto-answer

// deno-lint-ignore no-explicit-any
type Client = any;

const SENSITIVE_RE = /\b(refund|charg(e|ed|es)|billing|invoice|payment|cancel(l?ed|lation)?|subscription|delete my account|close my account|gdpr|ccpa|legal|lawsuit|attorney|chargeback|dispute)\b/i;
const HUMAN_RE = /\b(speak|talk|connect|escalate|transfer)\b.{0,20}\b(human|person|agent|representative|rep|someone|support team)\b|\bhuman\b.{0,10}\bplease\b/i;

interface Draft {
  answer: string;
  canAnswer: boolean;
  sources: string[];
}

async function draftAnswer(
  supabaseUrl: string,
  supabaseKey: string,
  question: string,
  passages: KbPassage[],
): Promise<{ draft: Draft; costUsd: number } | null> {
  const apiKey = Deno.env.get("CLAUDE_API") ?? Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return null;
  const config = await getAIConfig(supabaseUrl, supabaseKey);
  const context = passages
    .map((p, i) => `[${i + 1}] (${p.source ?? "KB"}) ${p.title}\n${p.content}`)
    .join("\n\n");
  const prompt =
    `You are the friendly support assistant for Des Moines Insider, a city-guide platform. ` +
    `Answer the user's question USING ONLY the knowledge-base passages below. ` +
    `If the passages do not clearly contain the answer, set "canAnswer" to false and do NOT guess. ` +
    `Cite the sources you used by their source label. Keep the answer concise, warm, and accurate.\n\n` +
    `Return ONLY compact JSON: {"answer": "...", "canAnswer": true|false, "sources": ["source label", ...]}.\n\n` +
    `KNOWLEDGE BASE:\n${context || "(no passages retrieved)"}\n\nUSER QUESTION:\n${question.slice(0, 1500)}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": config.anthropic_version },
      body: JSON.stringify({ model: config.default_model, max_tokens: 700, temperature: 0.2, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = (data.content ?? []).map((b: { text?: string }) => b.text ?? "").join("");
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const usage = data.usage ?? {};
    // Sonnet ~ $3/M in, $15/M out.
    const costUsd = (usage.input_tokens ?? 0) * (3 / 1_000_000) + (usage.output_tokens ?? 0) * (15 / 1_000_000);
    return {
      draft: {
        answer: String(parsed.answer ?? "").slice(0, 4000),
        canAnswer: parsed.canAnswer === true,
        sources: Array.isArray(parsed.sources) ? parsed.sources.slice(0, 8).map((s: unknown) => String(s)) : [],
      },
      costUsd,
    };
  } catch {
    return null;
  }
}

export const run: AgentRun = async (ctx, { supabase, body }) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const onlyTicket = body.ticketId ? String(body.ticketId) : null;

  let q = supabase
    .from("support_tickets")
    .select("id, subject, body, category, status, user_id")
    .in("status", ["new", "awaiting_user"])
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (onlyTicket) {
    q = supabase.from("support_tickets").select("id, subject, body, category, status, user_id").eq("id", onlyTicket).limit(1);
  }
  const { data: tickets } = await q;
  const rows = (tickets ?? []) as { id: string; subject: string | null; body: string; category: string | null; status: string; user_id: string | null }[];

  let sent = 0;
  let escalated = 0;
  let skipped = 0;
  let cost = 0;

  for (const t of rows) {
    // ── Thread state: only respond when the user spoke last (anti-ping-pong).
    const { data: msgs } = await supabase
      .from("support_messages")
      .select("sender, body, created_at")
      .eq("ticket_id", t.id)
      .order("created_at", { ascending: true });
    const thread = (msgs ?? []) as { sender: string; body: string; created_at: string }[];
    const agentReplies = thread.filter((m) => m.sender === "agent").length;
    const last = thread[thread.length - 1];
    // If the agent already replied and is waiting, or hit its reply cap, don't re-engage.
    if (last && last.sender === "agent") { skipped++; continue; }
    if (agentReplies >= MAX_AGENT_REPLIES) {
      // Too many rounds — hand to a human rather than ping-pong.
      await escalate(supabase, t, null, "reply limit reached — handing to a human", ctx);
      escalated++;
      continue;
    }

    const question = `${t.subject ?? ""}\n${last?.sender === "user" ? last.body : t.body}`.trim();

    // Crisis takes precedence over every other route (WEB-LEGAL-005). Not an
    // escalation: escalating means a person picks this up when they next work
    // the queue, which could be hours. Post the resources immediately AND flag
    // for a human, rather than choosing between them. No model call, no KB
    // retrieval, no quality gate - the reply is static.
    if (detectCrisisIntent(question)) {
      await supabase.from("support_messages").insert({
        ticket_id: t.id,
        sender: "agent",
        body: crisisMessageText(),
        metadata: { auto: true, crisisResources: true },
      });
      await escalate(supabase, t, null, "crisis resources sent; needs a human", ctx);
      escalated++;
      ctx.processed(1);
      continue;
    }

    const forcedHuman = HUMAN_RE.test(question);
    const sensitive = SENSITIVE_RE.test(question) || ["billing", "account", "legal"].includes((t.category ?? "").toLowerCase());

    // ── Retrieve grounded passages.
    let passages: KbPassage[] = [];
    try {
      const r = await retrieveKb(supabase, question, { matchCount: 5, threshold: 0.5 });
      passages = r.passages;
      cost += r.costUsd;
      ctx.tokens(r.tokens);
    } catch { /* retrieval down — treat as low confidence */ }
    const topSim = passages[0]?.similarity ?? 0;

    // Forced escalation paths never auto-send.
    if (forcedHuman || sensitive) {
      const reason = forcedHuman ? "user requested a human" : "sensitive topic (billing/account/legal)";
      const drafted = await draftAnswer(supabaseUrl, supabaseKey, question, passages);
      if (drafted) cost += drafted.costUsd;
      await escalate(supabase, t, drafted?.draft ?? null, reason, ctx);
      escalated++;
      continue;
    }

    // ── Draft.
    const drafted = await draftAnswer(supabaseUrl, supabaseKey, question, passages);
    if (drafted) cost += drafted.costUsd;
    const canAnswer = !!drafted?.draft.canAnswer && topSim >= 0.5;
    const highConfidence = canAnswer && topSim >= HIGH_CONFIDENCE_SIM;

    if (!drafted || !highConfidence) {
      await escalate(supabase, t, drafted?.draft ?? null, !drafted ? "draft unavailable" : `low confidence (top match ${Math.round(topSim * 100)}%)`, ctx);
      escalated++;
      continue;
    }

    // ── AOS-GOV-004 quality/safety gate BEFORE any auto-send.
    const withSources = drafted.draft.sources.length
      ? `${drafted.draft.answer}\n\nSources: ${drafted.draft.sources.join("; ")}`
      : drafted.draft.answer;
    const gate = await scoreOutput(supabase, { agentKey: AGENT_KEY, category: "support", content: withSources });
    if (!gate.passed) {
      await escalate(supabase, t, drafted.draft, `failed quality gate (${gate.score}/${gate.threshold})`, ctx);
      escalated++;
      continue;
    }

    // ── Auto-send (tier-1).
    await supabase.from("support_messages").insert({
      ticket_id: t.id,
      sender: "agent",
      body: withSources,
      metadata: { auto: true, topSimilarity: topSim, qualityScore: gate.score, sources: drafted.draft.sources },
    });
    await supabase.from("support_tickets").update({ status: "awaiting_user", updated_at: new Date().toISOString() }).eq("id", t.id);
    await writeAgentAudit(supabase, {
      agentKey: AGENT_KEY,
      actionType: "support_auto_reply",
      targetRef: `support_tickets:${t.id}`,
      after: { topSimilarity: topSim, qualityScore: gate.score, sources: drafted.draft.sources },
    });
    sent++;
    ctx.processed(1);
  }

  ctx.cost(cost);
  ctx.summary(`support: ${sent} auto-replied, ${escalated} escalated, ${skipped} awaiting-user; $${cost.toFixed(4)}`);
  ctx.meta({ sent, escalated, skipped, cost });
  return { sent, escalated, skipped };
};

// Escalate a ticket to tier-2 with an optional suggested draft (stored as an
// internal, non-sent agent message) + a routing task. Audited.
async function escalate(
  supabase: Client,
  t: { id: string; subject: string | null; category: string | null; user_id: string | null },
  draft: Draft | null,
  reason: string,
  // deno-lint-ignore no-explicit-any
  ctx: any,
): Promise<void> {
  await supabase.from("support_tickets").update({ status: "escalated", updated_at: new Date().toISOString() }).eq("id", t.id);
  if (draft?.answer) {
    await supabase.from("support_messages").insert({
      ticket_id: t.id,
      sender: "agent",
      body: draft.answer,
      metadata: { draft: true, suggested: true, sent: false, sources: draft.sources },
    });
  }
  const task = await createAgentTask(supabase, {
    agentKey: AGENT_KEY,
    category: "support",
    title: `Support ticket needs a human: ${t.subject ?? "(no subject)"} — ${reason}`,
    confidence: 0,
    forceTier: 2,
    dedupeKey: `support-ticket:${t.id}`,
    payload: { ticketId: t.id, reason, suggestedDraft: draft?.answer ?? null, sources: draft?.sources ?? [] },
  });
  if (task.ok) ctx.escalated(1);
  await writeAgentAudit(supabase, {
    agentKey: AGENT_KEY,
    actionType: "support_escalation",
    targetRef: `support_tickets:${t.id}`,
    after: { reason, hasSuggestedDraft: !!draft?.answer },
  });
}
