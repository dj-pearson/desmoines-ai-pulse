/**
 * SECURITY: verify_jwt = false
 * Reason: admin ticket console; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: LOW (admin-only ticket ops; sends replies to users, audited).
 *
 * support-console (AOS-CS-008) — the human tier-2/3 ticket workspace backend.
 * Actions: list (filters), thread (full thread + user context), suggest_reply
 * (KB-grounded AI draft), send_reply (audited, updates status), assign,
 * add_note (internal), merge (duplicate), canned (library).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { writeAgentAudit } from "../_shared/auditLog.ts";
import { retrieveKb } from "../_shared/kbRetrieve.ts";
import { getAIConfig } from "../_shared/aiConfig.ts";

const AGENT_KEY = "support-console";

// deno-lint-ignore no-explicit-any
type Client = any;

function j(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

async function suggest(supabaseUrl: string, supabaseKey: string, thread: { sender: string; body: string }[], passages: { title: string; content: string; source: string | null }[]): Promise<string | null> {
  const apiKey = Deno.env.get("CLAUDE_API") ?? Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return null;
  const config = await getAIConfig(supabaseUrl, supabaseKey);
  const context = passages.map((p, i) => `[${i + 1}] (${p.source ?? "KB"}) ${p.title}\n${p.content}`).join("\n\n");
  const convo = thread.map((m) => `${m.sender.toUpperCase()}: ${m.body}`).join("\n");
  const prompt =
    `You are drafting a support reply for a human agent to review and edit. Use the knowledge base where relevant, ` +
    `be warm and concise, and don't invent policy. Return ONLY the reply text.\n\nKNOWLEDGE BASE:\n${context || "(none)"}\n\nTHREAD:\n${convo}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": config.anthropic_version },
      body: JSON.stringify({ model: config.default_model, max_tokens: 600, temperature: 0.3, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.content ?? []).map((b: { text?: string }) => b.text ?? "").join("").trim().slice(0, 4000) || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405, corsHeaders);

  const authError = await requireAdminOrApiKey(req, corsHeaders);
  if (authError) return authError;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase: Client = createClient(supabaseUrl, supabaseKey);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "list");

  try {
    if (action === "list") {
      let q = supabase
        .from("support_tickets")
        .select("id, subject, body, channel, status, priority, sentiment, urgency, category, assigned_to, sla_due_at, csat_score, created_at, merged_into")
        .is("merged_into", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (body.status) q = q.eq("status", String(body.status));
      if (body.priority) q = q.eq("priority", String(body.priority));
      if (body.assignedTo) q = q.eq("assigned_to", String(body.assignedTo));
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return j({ ok: true, tickets: data ?? [] }, 200, corsHeaders);
    }

    if (action === "thread") {
      const id = String(body.id ?? "");
      const { data: ticket } = await supabase.from("support_tickets").select("*").eq("id", id).maybeSingle();
      if (!ticket) return j({ error: "not found" }, 404, corsHeaders);
      const { data: messages } = await supabase.from("support_messages").select("id, sender, body, metadata, created_at").eq("ticket_id", id).order("created_at", { ascending: true });

      // User context: subscription + light activity.
      let context: Record<string, unknown> = { authenticated: !!ticket.user_id };
      if (ticket.user_id) {
        const [{ data: sub }, favs, reviews] = await Promise.all([
          supabase.from("user_subscriptions").select("status, current_period_end, cancel_at_period_end, plan:subscription_plans(name, tier)").eq("user_id", ticket.user_id).in("status", ["active", "trialing", "past_due"]).maybeSingle(),
          supabase.from("favorites").select("id", { count: "exact", head: true }).eq("user_id", ticket.user_id),
          supabase.from("reviews").select("id", { count: "exact", head: true }).eq("user_id", ticket.user_id),
        ]);
        context = { authenticated: true, subscription: sub ?? null, favorites: favs.count ?? 0, reviews: reviews.count ?? 0 };
      }
      return j({ ok: true, ticket, messages: messages ?? [], context }, 200, corsHeaders);
    }

    if (action === "suggest_reply") {
      const id = String(body.id ?? "");
      const { data: messages } = await supabase.from("support_messages").select("sender, body").eq("ticket_id", id).order("created_at", { ascending: true });
      const thread = (messages ?? []) as { sender: string; body: string }[];
      const lastUser = [...thread].reverse().find((m) => m.sender === "user")?.body ?? thread[0]?.body ?? "";
      let passages: { title: string; content: string; source: string | null }[] = [];
      try { passages = (await retrieveKb(supabase, lastUser, { matchCount: 5, threshold: 0.5 })).passages; } catch { /* KB down */ }
      const draft = await suggest(supabaseUrl, supabaseKey, thread, passages);
      return j({ ok: true, draft: draft ?? "", sources: passages.map((p) => p.source).filter(Boolean) }, 200, corsHeaders);
    }

    if (action === "send_reply") {
      const id = String(body.id ?? "");
      const text = String(body.body ?? "").trim();
      if (!text) return j({ error: "body required" }, 400, corsHeaders);
      const newStatus = body.status ? String(body.status) : "awaiting_user";
      await supabase.from("support_messages").insert({ ticket_id: id, sender: "admin", body: text, metadata: { via: "console" } });
      const patch: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() };
      await supabase.from("support_tickets").update(patch).eq("id", id);
      await writeAgentAudit(supabase, { agentKey: AGENT_KEY, actionType: "console_reply_sent", targetRef: `support_tickets:${id}`, actor: body.actorId ? String(body.actorId) : "admin", after: { status: newStatus, chars: text.length } });
      return j({ ok: true }, 200, corsHeaders);
    }

    if (action === "assign") {
      const id = String(body.id ?? "");
      const assignedTo = body.assignedTo ? String(body.assignedTo) : null;
      await supabase.from("support_tickets").update({ assigned_to: assignedTo, status: assignedTo ? "assigned" : "escalated", updated_at: new Date().toISOString() }).eq("id", id);
      await writeAgentAudit(supabase, { agentKey: AGENT_KEY, actionType: "console_assign", targetRef: `support_tickets:${id}`, actor: body.actorId ? String(body.actorId) : "admin", after: { assignedTo } });
      return j({ ok: true }, 200, corsHeaders);
    }

    if (action === "add_note") {
      const id = String(body.id ?? "");
      const note = String(body.body ?? "").trim();
      if (!note) return j({ error: "body required" }, 400, corsHeaders);
      // Internal note = a system message flagged internal (never shown to users).
      await supabase.from("support_messages").insert({ ticket_id: id, sender: "system", body: note, metadata: { internal: true, actorId: body.actorId ?? null } });
      return j({ ok: true }, 200, corsHeaders);
    }

    if (action === "merge") {
      const id = String(body.id ?? "");        // duplicate
      const into = String(body.into ?? "");     // canonical
      if (!id || !into || id === into) return j({ error: "id and distinct into required" }, 400, corsHeaders);
      // Move messages to the canonical ticket, mark the duplicate merged + closed.
      await supabase.from("support_messages").update({ ticket_id: into }).eq("ticket_id", id);
      await supabase.from("support_tickets").update({ merged_into: into, status: "closed", updated_at: new Date().toISOString() }).eq("id", id);
      await writeAgentAudit(supabase, { agentKey: AGENT_KEY, actionType: "console_merge", targetRef: `support_tickets:${id}`, actor: body.actorId ? String(body.actorId) : "admin", after: { mergedInto: into } });
      return j({ ok: true }, 200, corsHeaders);
    }

    if (action === "canned") {
      const { data } = await supabase.from("support_canned_responses").select("id, title, body, category").eq("is_active", true).order("title");
      return j({ ok: true, canned: data ?? [] }, 200, corsHeaders);
    }

    return j({ error: `unknown action: ${action}` }, 400, corsHeaders);
  } catch (err) {
    return j({ error: (err as Error)?.message ?? "console error" }, 500, corsHeaders);
  }
});
