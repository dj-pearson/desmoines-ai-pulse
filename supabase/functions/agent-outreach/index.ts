/**
 * SECURITY: verify_jwt = false
 * Reason: cron control-plane job; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: MEDIUM (sends B2B outreach — step-1 approval-gated, CAN-SPAM
 *   compliant, suppression-checked, frequency-capped, quality-gated, audited).
 *
 * agent-outreach (AOS-PROSPECT-004) — guardrailed outreach sequencing.
 *
 * Sends a personalized multi-step sequence to QUALIFIED leads with a
 * business-contact email. Guardrails:
 *   - the step-1 template must be APPROVED (createApproval → AOS-CORE-007);
 *     until then the sequence cannot auto-run.
 *   - suppression list + opt-out respected; sequence halts on reply
 *     (outreach_stopped) — the agent never negotiates or commits pricing.
 *   - CAN-SPAM: emailLayout marketing footer (physical address + one-click
 *     unsubscribe); frequency cap between steps; AOS-GOV-004 quality gate;
 *     every send audited.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { scoreOutput } from "../_shared/scoreOutput.ts";
import { createApproval } from "../_shared/agentApprovals.ts";
import { writeAgentAudit } from "../_shared/auditLog.ts";
import { renderEmail } from "../_shared/emailLayout.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

const AGENT_KEY = "outreach-sequencer";
const BATCH = 100;
const STEP_GAP_DAYS = 4; // frequency cap between steps
const MAX_STEP = 3;
const DAY = 24 * 60 * 60 * 1000;

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function fill(t: string, name: string): string {
  return t.replace(/\{\{business_name\}\}/g, name);
}

async function suppressed(supabase: Client, email: string): Promise<boolean> {
  const domain = email.split("@")[1] ?? "";
  const { data } = await supabase.from("outreach_suppression").select("id").or(`email.eq.${email},domain.eq.${domain}`).limit(1);
  return (data ?? []).length > 0;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders);

  const authError = await requireAdminOrApiKey(req, corsHeaders);
  if (authError) return authError;

  const supabase: Client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const from = Deno.env.get("OUTREACH_FROM") || Deno.env.get("NURTURE_FROM") || "Des Moines Insider <partnerships@desmoinesinsider.com>";
  const apiKey = Deno.env.get("RESEND_API_KEY");

  const ledger = await runAgent(AGENT_KEY, async (ctx) => {
    const now = Date.now();

    // ── Guardrail: step-1 template must be approved before ANY auto-run. ──
    const { data: templates } = await supabase.from("outreach_templates").select("step, subject, body, approved").order("step");
    const tByStep = new Map<number, { subject: string; body: string; approved: boolean }>();
    for (const t of (templates ?? []) as { step: number; subject: string; body: string; approved: boolean }[]) tByStep.set(t.step, t);
    const step1 = tByStep.get(1);
    if (!step1?.approved) {
      // Queue the one-time approval (deduped) and stop — nothing sends.
      await createApproval(supabase, { agentKey: AGENT_KEY, actionType: "send_outreach", payload: { step: 1, reason: "approve outreach step-1 template before the sequence runs" } });
      ctx.summary("step-1 template not approved — approval queued, no sends");
      return { sent: 0, blocked: "awaiting_template_approval" };
    }

    // ── Qualified leads with a contact email, sequence not stopped. ───────
    const { data: leads } = await supabase
      .from("crm_leads")
      .select("id, business_name, contact_email")
      .eq("status", "qualified")
      .eq("outreach_stopped", false)
      .not("contact_email", "is", null)
      .limit(BATCH);
    const rows = (leads ?? []) as { id: string; business_name: string; contact_email: string }[];

    let sent = 0, skipped = 0, gated = 0, done = 0;

    for (const l of rows) {
      const email = l.contact_email;
      if (await suppressed(supabase, email)) { skipped++; continue; }

      // Determine next step from prior sends + cadence.
      const { data: prior } = await supabase.from("outreach_sends").select("step, created_at").eq("lead_id", l.id).order("created_at", { ascending: false });
      const sends = (prior ?? []) as { step: number; created_at: string }[];
      const lastStep = sends.length ? Math.max(...sends.map((s) => s.step)) : 0;
      if (lastStep >= MAX_STEP) { done++; continue; }
      if (sends.length && now - new Date(sends[0].created_at).getTime() < STEP_GAP_DAYS * DAY) { skipped++; continue; }
      const nextStep = lastStep + 1;
      const tpl = tByStep.get(nextStep);
      if (!tpl?.approved) { skipped++; continue; } // every step template must be approved

      const subject = fill(tpl.subject, l.business_name);
      const bodyText = fill(tpl.body, l.business_name);

      // Quality/safety gate before any send.
      const gate = await scoreOutput(supabase, { agentKey: AGENT_KEY, category: "prospect", content: `${subject}\n\n${bodyText}` });
      if (!gate.passed) { gated++; continue; }

      // CAN-SPAM compliant render (physical address + one-click unsubscribe).
      const rendered = renderEmail({
        bodyHtml: `<p>${bodyText.replace(/\n/g, "<br>")}</p>`,
        bodyText,
        recipient: { email, preferencesPath: "/unsubscribe" },
        category: "marketing",
      });

      let status = "skipped", messageId: string | null = null;
      if (apiKey) {
        try {
          const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
          if (rendered.listUnsubscribe) headers["List-Unsubscribe"] = rendered.listUnsubscribe;
          if (rendered.listUnsubscribePost) headers["List-Unsubscribe-Post"] = rendered.listUnsubscribePost;
          const res = await fetchWithTimeout("https://api.resend.com/emails", { method: "POST", headers, body: JSON.stringify({ from, to: [email], subject, html: rendered.html, text: rendered.text }) });
          const jb = await res.json().catch(() => ({}));
          if (res.ok) { status = "queued"; messageId = jb?.id ?? null; sent++; } else status = "failed";
        } catch { status = "failed"; }
      }

      await supabase.from("outreach_sends").insert({ lead_id: l.id, step: nextStep, email, resend_message_id: messageId, status });
      if (nextStep === 1) await supabase.from("crm_leads").update({ status: "contacted" }).eq("id", l.id);
      await writeAgentAudit(supabase, { agentKey: AGENT_KEY, actionType: "outreach_sent", targetRef: `crm_leads:${l.id}`, after: { step: nextStep, status, qualityScore: gate.score } });
    }

    ctx.processed(rows.length);
    ctx.summary(`outreach: ${sent} sent, ${skipped} skipped, ${gated} quality-gated, ${done} sequence-complete`);
    ctx.meta({ sent, skipped, gated, done });
    return { sent, skipped, gated, done };
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
