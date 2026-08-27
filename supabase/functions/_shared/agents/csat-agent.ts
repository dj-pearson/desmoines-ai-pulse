/**
 * agent csat-agent (AOS-CS-007) — post-resolution CSAT prompt sender.
 *
 * Hourly, finds tickets newly resolved without a CSAT prompt, determines whether
 * the resolution was auto (agent) or human, posts a lightweight in-app CSAT
 * prompt to the thread (with one-click rating links for email), and stamps
 * csat_prompt_sent_at + resolved_by. Score capture + low-CSAT re-escalation
 * happen in support-csat-submit.
 *
 * Consolidated into `agent-runner` (was `agent-csat/index.ts`).
 */
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "csat-agent";
const BATCH = 50;

export const run: AgentRun = async (ctx, { supabase }) => {
  const siteUrl = (Deno.env.get("VITE_SITE_URL") || Deno.env.get("SITE_URL") || "").replace(/\/+$/, "");

  const { data: resolved, error: resolvedError } = await supabase
    .from("support_tickets")
    .select("id, channel, assigned_to, sla_escalated_at, resolved_by")
    .eq("status", "resolved")
    .is("csat_prompt_sent_at", null)
    .not("resolved_at", "is", null)
    .limit(BATCH);
  // WEB-BE-032. THE work list. A dropped error processed nothing and reported a
  // successful run, indistinguishable from an empty resolved-ticket queue.
  if (resolvedError) throw new Error(`csat: resolved-ticket queue read failed: ${resolvedError.message}`);
  const tickets = (resolved ?? []) as { id: string; channel: string; assigned_to: string | null; sla_escalated_at: string | null; resolved_by: string | null }[];

  let sent = 0;
  for (const t of tickets) {
    // Auto if no human ever touched it (unassigned + never SLA-escalated).
    const resolvedBy = t.resolved_by ?? (t.assigned_to == null && t.sla_escalated_at == null ? "auto" : "human");
    const link = siteUrl ? `${siteUrl}/csat?ticket=${t.id}` : `/csat?ticket=${t.id}`;
    const promptBody =
      `How did we do? Rate your support experience 1–5.\n` +
      (siteUrl ? [1, 2, 3, 4, 5].map((n) => `${n}★ ${link}&score=${n}`).join("\n") : `Open ${link} to rate.`);
    await supabase.from("support_messages").insert({
      ticket_id: t.id,
      sender: "system",
      body: promptBody,
      metadata: { csat_prompt: true, resolvedBy },
    });
    await supabase.from("support_tickets").update({ csat_prompt_sent_at: new Date().toISOString(), resolved_by: resolvedBy }).eq("id", t.id);
    sent++;
  }

  ctx.processed(sent);
  ctx.summary(`sent ${sent} CSAT prompt(s)`);
  ctx.meta({ sent });
  return { sent };
};
