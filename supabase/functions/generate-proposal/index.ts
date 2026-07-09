/**
 * SECURITY: verify_jwt = false
 * Reason: admin/sales-invoked from the CRM console; auth via requireAdminOrApiKey.
 * Risk level: LOW (assembles a proposal draft from real stats + the configured
 *   price list; never sends anything; attached to the opportunity + audited).
 *
 * generate-proposal (AOS-PROSPECT-005) — proposal / media-kit generator.
 *
 * For a given opportunity, assembles a tailored proposal: REAL audience stats
 * (computed from platform data), placement options, and pricing tiers pulled
 * ONLY from ad_price_list — the agent never invents prices. Output is a
 * shareable HTML doc DRAFT attached to the opportunity, for human review.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { writeAgentAudit } from "../_shared/auditLog.ts";

const AGENT_KEY = "proposal-generator";

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}

async function count(supabase: Client, table: string, apply?: (q: Client) => Client): Promise<number> {
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  if (apply) q = apply(q);
  const { count } = await q;
  return count ?? 0;
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

  const body = await req.json().catch(() => ({}));
  const opportunityId = body.opportunityId ? String(body.opportunityId) : null;
  if (!opportunityId) return json({ error: "opportunityId is required" }, 400, corsHeaders);

  const ledger = await runAgent(AGENT_KEY, async (ctx) => {
    const { data: opp } = await supabase.from("crm_opportunities").select("id, name, account_id").eq("id", opportunityId).maybeSingle();
    if (!opp) throw new Error("opportunity not found");
    const { data: account } = await supabase.from("crm_accounts").select("name, category, city").eq("id", opp.account_id).maybeSingle();
    const businessName = account?.name ?? opp.name ?? "your business";

    // ── Pricing STRICTLY from the configured price list (never invented) ──
    const { data: priceRows } = await supabase.from("ad_price_list").select("product_key, name, description, tier, price, unit").eq("active", true).order("sort_order");
    const prices = (priceRows ?? []) as { product_key: string; name: string; description: string | null; tier: string | null; price: number; unit: string }[];
    if (prices.length === 0) throw new Error("no active ad products configured — cannot generate pricing");

    // ── Real audience stats (computed from platform data) ────────────────
    const [users, activeUsers, upcomingEvents, restaurants, subscribers] = await Promise.all([
      count(supabase, "profiles"),
      count(supabase, "profiles", (q) => q.eq("lifecycle_stage", "active")),
      count(supabase, "events", (q) => q.gte("date", new Date().toISOString()).is("archived_at", null)),
      count(supabase, "restaurants"),
      count(supabase, "newsletter_subscribers", (q) => q.eq("status", "active")),
    ]);
    const audience = { registeredUsers: users, monthlyActive: activeUsers, newsletterSubscribers: subscribers, upcomingEvents, listedRestaurants: restaurants };

    // ── Assemble the shareable doc draft ─────────────────────────────────
    const priceRowsHtml = prices.map((p) =>
      `<tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>${esc(p.name)}</strong>${p.tier ? ` <em>(${esc(p.tier)})</em>` : ""}<br><span style="color:#666;font-size:13px">${esc(p.description ?? "")}</span></td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">$${Number(p.price).toLocaleString()}/${esc(p.unit)}</td></tr>`,
    ).join("");

    const html =
      `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:680px;margin:0 auto;color:#222">` +
      `<h1>Advertising Proposal — ${esc(businessName)}</h1>` +
      `<p style="color:#666"><em>Draft for review. Prepared by Des Moines Insider.</em></p>` +
      `<h2>Why Des Moines Insider</h2>` +
      `<p>Reach engaged locals actively looking for places to go and things to do${account?.city ? ` in ${esc(account.city)}` : ""}.</p>` +
      `<ul>` +
      `<li><strong>${audience.registeredUsers.toLocaleString()}</strong> registered users</li>` +
      `<li><strong>${audience.monthlyActive.toLocaleString()}</strong> monthly active</li>` +
      `<li><strong>${audience.newsletterSubscribers.toLocaleString()}</strong> newsletter subscribers</li>` +
      `<li><strong>${audience.upcomingEvents.toLocaleString()}</strong> upcoming events · <strong>${audience.listedRestaurants.toLocaleString()}</strong> listed restaurants</li>` +
      `</ul>` +
      `<h2>Placement options &amp; pricing</h2>` +
      `<table style="width:100%;border-collapse:collapse">${priceRowsHtml}</table>` +
      `<p style="color:#666;font-size:13px;margin-top:16px">Pricing per the current Des Moines Insider rate card. Final package and terms subject to agreement.</p>` +
      `</div>`;

    const content = { businessName, audience, pricing: prices };
    const { data: proposal } = await supabase.from("proposals").insert({ opportunity_id: opportunityId, account_id: opp.account_id, content, html, status: "draft" }).select("id").single();

    await writeAgentAudit(supabase, { agentKey: AGENT_KEY, actionType: "proposal_generated", targetRef: `crm_opportunities:${opportunityId}`, after: { proposalId: proposal?.id, products: prices.length } });

    ctx.processed(1);
    ctx.summary(`generated proposal for ${businessName} (${prices.length} products, draft)`);
    ctx.meta({ proposalId: proposal?.id, products: prices.length, audience });
    return { proposalId: proposal?.id, status: "draft" };
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
