/**
 * notifyOps — the OS reaching out (AOS-CORE-010).
 *
 * One place agents send operational notifications: escalations, failures, and
 * the daily digest. Routes by severity over the existing Resend email plumbing
 * and an optional ops webhook (Slack-compatible), frequency-caps/coalesces so a
 * storm of tasks isn't a storm of emails, and is fully fail-safe — a delivery
 * failure is logged and NEVER blocks the originating agent.
 *
 * Env: RESEND_API_KEY + (ADMIN_ALERT_EMAIL | ALERT_EMAIL) for email;
 *      OPS_WEBHOOK_URL (or SLACK_WEBHOOK_URL) for the webhook.
 */

import { fetchWithTimeout } from "./fetchWithTimeout.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

export type OpsSeverity = "low" | "medium" | "high" | "critical";
export type OpsChannel = "email" | "webhook";

export interface NotifyOpsArgs {
  severity: OpsSeverity;
  title: string;
  body: string;
  /** Coalescing key — repeats within the cap window are suppressed + counted. */
  dedupeKey?: string;
  /** Override the cap window (ms). Default 15 min. */
  capWindowMs?: number;
}

export interface NotifyOpsResult {
  sent: boolean;
  coalesced: boolean;
  channels: OpsChannel[];
  suppressedCount?: number;
}

const DEFAULT_CAP_WINDOW_MS = 15 * 60 * 1000;

/** low → digest only (never sent immediately); the rest escalate the channels. */
function channelsFor(severity: OpsSeverity): OpsChannel[] {
  switch (severity) {
    case "low":
      return []; // batched into the daily digest, not sent now
    case "medium":
      return ["webhook"]; // webhook if configured, else falls back to email below
    case "high":
    case "critical":
      return ["email", "webhook"];
  }
}

export async function notifyOps(supabase: Client, args: NotifyOpsArgs): Promise<NotifyOpsResult> {
  const dedupeKey = args.dedupeKey ?? `${args.severity}:${args.title}`;
  const capWindow = args.capWindowMs ?? DEFAULT_CAP_WINDOW_MS;
  let channels = channelsFor(args.severity);

  // low severity is digest-only — record nothing, send nothing now.
  if (channels.length === 0) {
    return { sent: false, coalesced: false, channels: [] };
  }

  // ── Frequency cap / coalesce ────────────────────────────────────────────
  try {
    const since = new Date(Date.now() - capWindow).toISOString();
    const { data: recent } = await supabase
      .from("ops_notification_log")
      .select("id, suppressed_count")
      .eq("dedupe_key", dedupeKey)
      .gte("last_sent_at", since)
      .order("last_sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recent?.id) {
      // Within the window — coalesce: bump the counter, do not send again.
      await supabase
        .from("ops_notification_log")
        .update({ suppressed_count: (recent.suppressed_count ?? 0) + 1 })
        .eq("id", recent.id);
      return {
        sent: false,
        coalesced: true,
        channels: [],
        suppressedCount: (recent.suppressed_count ?? 0) + 1,
      };
    }
  } catch (err) {
    // Cap-state read failed — fall through and send (better a dupe than silence).
    console.warn("[notifyOps] cap-window check failed:", err instanceof Error ? err.message : String(err));
  }

  // ── Deliver (each channel independently fail-safe) ──────────────────────
  const delivered: OpsChannel[] = [];
  const webhookOk = channels.includes("webhook") ? await sendWebhook(args) : false;
  if (webhookOk) delivered.push("webhook");
  // Email when routed to email, OR as a fallback when a webhook was wanted but
  // not configured/failed (so medium alerts still reach someone).
  const wantEmail = channels.includes("email") || (channels.includes("webhook") && !webhookOk);
  if (wantEmail && (await sendEmail(args))) delivered.push("email");

  // Record the send (drives future coalescing). Best-effort.
  try {
    await supabase.from("ops_notification_log").insert({
      dedupe_key: dedupeKey,
      severity: args.severity,
      title: args.title,
      channels: delivered,
    });
  } catch (err) {
    console.warn("[notifyOps] failed to record notification:", err instanceof Error ? err.message : String(err));
  }

  return { sent: delivered.length > 0, coalesced: false, channels: delivered };
}

async function sendEmail(args: NotifyOpsArgs): Promise<boolean> {
  try {
    const to = Deno.env.get("ADMIN_ALERT_EMAIL") || Deno.env.get("ALERT_EMAIL");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!to || !resendKey) {
      console.warn(`[notifyOps] email not sent (missing ADMIN_ALERT_EMAIL/RESEND_API_KEY): ${args.title}`);
      return false;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: "Des Moines Insider Automation <automation@desmoinesinsider.com>",
        to: [to],
        subject: `[${args.severity.toUpperCase()}] ${args.title}`,
        text: `${args.body}\n\nSeverity: ${args.severity}\nSee Admin → Agents / Escalation inbox for details.`,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("[notifyOps] email delivery failed:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

async function sendWebhook(args: NotifyOpsArgs): Promise<boolean> {
  try {
    const url = Deno.env.get("OPS_WEBHOOK_URL") || Deno.env.get("SLACK_WEBHOOK_URL");
    if (!url) return false;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `*[${args.severity.toUpperCase()}] ${args.title}*\n${args.body}` }),
    });
    return res.ok;
  } catch (err) {
    console.error("[notifyOps] webhook delivery failed:", err instanceof Error ? err.message : String(err));
    return false;
  }
}
