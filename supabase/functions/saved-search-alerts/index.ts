/**
 * saved-search-alerts (WEB-FEAT-003)
 *
 * Nightly event-alert digest. Runs every active event-list saved search against
 * events created since that search's last run, groups matches per user, and sends
 * ONE consolidated email per user with deep links back to the filtered /events
 * URL (WEB-UX-001 URL-state makes the links work). jobRunner-wrapped (WEB-AUTO-001)
 * so runs are observable and failures alert.
 *
 * Respects preferences: skips users with event_alerts_enabled=false or no verified
 * email; zero matches = no email. Emails are marketing-category with one-click
 * unsubscribe. Each search's last_alerted_at is advanced regardless so the window
 * never re-scans the same events.
 *
 * Auth: verify_jwt=false; does its own auth via requireAdminOrApiKey (cron
 * service-role key or admin JWT). Trigger: pg_cron nightly.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runJob } from "../_shared/jobRunner.ts";
import { renderEmail, SITE_URL } from "../_shared/emailLayout.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS_PER_SEARCH = 8;

interface SavedSearch {
  id: string;
  user_id: string;
  name: string;
  filters: Record<string, unknown> | null;
  last_alerted_at: string | null;
}

interface EventRow {
  id: string;
  title: string;
  date: string | null;
  category: string | null;
  location: string | null;
  city: string | null;
  price: string | null;
  image_url: string | null;
  is_hidden: boolean | null;
  created_at: string;
}

const FILTER_KEYS = ["q", "category", "location", "price", "preset", "sort"] as const;

function escapeHtml(s: string): string {
  return s.replace(/[<>&"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : "&quot;");
}

/** Build the /events deep link from a saved search's stored filter params. */
function deepLink(filters: Record<string, unknown> | null): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const v = filters?.[key];
    if (typeof v === "string" && v && v !== "all" && v !== "any-location" && v !== "any-price") {
      params.set(key, v);
    }
  }
  const qs = params.toString();
  return `${SITE_URL}/events${qs ? `?${qs}` : ""}`;
}

/** Does an event match a saved search's filters? (best-effort; never over-excludes) */
function matches(ev: EventRow, filters: Record<string, unknown> | null): boolean {
  if (!filters) return true;
  const cat = filters.category;
  if (typeof cat === "string" && cat && cat !== "all") {
    if ((ev.category || "").toLowerCase() !== cat.toLowerCase()) return false;
  }
  const q = filters.q;
  if (typeof q === "string" && q.trim()) {
    const hay = `${ev.title} ${ev.location ?? ""} ${ev.city ?? ""}`.toLowerCase();
    if (!hay.includes(q.toLowerCase())) return false;
  }
  const loc = filters.location;
  if (typeof loc === "string" && loc && loc !== "any-location" && loc.toLowerCase() !== "near me") {
    const hay = `${ev.location ?? ""} ${ev.city ?? ""}`.toLowerCase();
    if (!hay.includes(loc.toLowerCase())) return false;
  }
  // Only the unambiguous 'free' price preset is matched against the TEXT price.
  if (filters.price === "free") {
    const p = (ev.price ?? "").toLowerCase();
    if (!(p === "" || p.includes("free") || p === "0" || p === "$0")) return false;
  }
  return true;
}

function fmtDate(date: string | null): string {
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(date));
  } catch {
    return "";
  }
}

type Supa = ReturnType<typeof createClient>;

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase: Supa = createClient(supabaseUrl, serviceKey);

  const job = await runJob("saved-search-alerts", async (ctx) => {
    const nowIso = new Date().toISOString();

    // 1. Active event-list saved searches.
    const { data: searchesRaw } = await supabase
      .from("saved_searches")
      .select("id, user_id, name, filters, last_alerted_at")
      .eq("search_type", "event_list")
      .eq("alerts_enabled", true);
    const searches = (searchesRaw ?? []) as SavedSearch[];
    if (searches.length === 0) {
      ctx.meta({ searches: 0 });
      return { searches: 0, emailsSent: 0 };
    }

    // 2. Candidate events created since the earliest window across all searches.
    let earliest = Date.now() - DEFAULT_WINDOW_MS;
    for (const s of searches) {
      const t = s.last_alerted_at ? new Date(s.last_alerted_at).getTime() : Date.now() - DEFAULT_WINDOW_MS;
      if (t < earliest) earliest = t;
    }
    const today = new Date().toISOString().split("T")[0];
    const { data: eventsRaw } = await supabase
      .from("events")
      .select("id, title, date, category, location, city, price, image_url, is_hidden, created_at")
      .gte("created_at", new Date(earliest).toISOString())
      .gte("date", today)
      .neq("is_hidden", true)
      .order("created_at", { ascending: false })
      .limit(500);
    const events = (eventsRaw ?? []) as EventRow[];

    // 3. Per-user accumulation of matched searches.
    const perUser = new Map<string, { name: string; link: string; events: EventRow[] }[]>();
    for (const s of searches) {
      const since = s.last_alerted_at ? new Date(s.last_alerted_at).getTime() : Date.now() - DEFAULT_WINDOW_MS;
      const matched = events.filter(
        (ev) => new Date(ev.created_at).getTime() >= since && matches(ev, s.filters),
      );
      if (matched.length > 0) {
        const list = perUser.get(s.user_id) ?? [];
        list.push({ name: s.name, link: deepLink(s.filters), events: matched.slice(0, MAX_EVENTS_PER_SEARCH) });
        perUser.set(s.user_id, list);
      }
    }

    // 4. Resolve recipients (verified email + alerts opted in) and send.
    let emailsSent = 0;
    let failed = 0;
    const userIds = [...perUser.keys()];

    if (userIds.length > 0 && RESEND_API_KEY) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, email_verified")
        .in("id", userIds);
      const { data: prefs } = await supabase
        .from("user_email_preferences")
        .select("user_id, event_alerts_enabled")
        .in("user_id", userIds);
      const prefMap = new Map<string, boolean>();
      for (const p of prefs ?? []) prefMap.set((p as any).user_id, (p as any).event_alerts_enabled !== false);

      for (const profile of profiles ?? []) {
        const uid = (profile as any).id as string;
        const email = (profile as any).email as string | null;
        const verified = (profile as any).email_verified as boolean | null;
        if (!email || verified === false) continue;
        if (prefMap.get(uid) === false) continue; // opted out

        const groups = perUser.get(uid);
        if (!groups || groups.length === 0) continue;

        const { data: sub } = await supabase
          .from("newsletter_subscribers")
          .select("unsubscribe_token")
          .eq("email", email.toLowerCase().trim())
          .maybeSingle();

        const totalNew = groups.reduce((n, g) => n + g.events.length, 0);
        const { html, text } = buildEmail(groups, email, (sub as any)?.unsubscribe_token ?? null);
        const rendered = renderEmail({
          bodyHtml: html,
          bodyText: text,
          category: "marketing",
          recipient: { email, unsubscribeToken: (sub as any)?.unsubscribe_token ?? null, preferencesPath: "/dashboard?tab=saved-searches" },
        });

        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
            body: JSON.stringify({
              from: "Des Moines Insider <events@desmoinesinsider.com>",
              to: [email],
              subject: `${totalNew} new event${totalNew === 1 ? "" : "s"} matching your saved search${groups.length === 1 ? "" : "es"}`,
              html: rendered.html,
              text: rendered.text,
              headers: rendered.listUnsubscribe
                ? { "List-Unsubscribe": rendered.listUnsubscribe, "List-Unsubscribe-Post": rendered.listUnsubscribePost ?? "" }
                : undefined,
            }),
          });
          if (res.ok) emailsSent++;
          else {
            failed++;
            console.error(`[saved-search-alerts] resend ${res.status} for ${email}`);
          }
        } catch (err) {
          failed++;
          console.error(`[saved-search-alerts] send threw for ${email}:`, err);
        }
      }
    }

    // 5. Advance the window for every processed search (even zero-match ones).
    const ids = searches.map((s) => s.id);
    await supabase.from("saved_searches").update({ last_alerted_at: nowIso }).in("id", ids);

    ctx.processed(emailsSent);
    ctx.failed(failed);
    ctx.meta({
      searches: searches.length,
      candidateEvents: events.length,
      usersWithMatches: userIds.length,
      emailsSent,
      resendConfigured: !!RESEND_API_KEY,
    });
    return { searches: searches.length, emailsSent, usersWithMatches: userIds.length };
  });

  return new Response(
    JSON.stringify({ ok: job.ok, status: job.status, runId: job.runId, result: job.result, error: job.error }),
    { status: job.ok ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

function buildEmail(
  groups: { name: string; link: string; events: EventRow[] }[],
  _email: string,
  _token: string | null,
): { html: string; text: string } {
  const sections = groups
    .map((g) => {
      const items = g.events
        .map((ev) => {
          const when = fmtDate(ev.date);
          const url = `${SITE_URL}/events`;
          return `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;">
            <a href="${url}" style="color:#1a1a1a;font-weight:600;text-decoration:none;">${escapeHtml(ev.title)}</a>
            ${when ? `<div style="color:#666;font-size:13px;">${escapeHtml(when)}${ev.location ? " · " + escapeHtml(ev.location) : ""}</div>` : ""}
          </td></tr>`;
        })
        .join("");
      return `<div style="margin:0 0 24px;">
        <h3 style="margin:0 0 8px;font-size:16px;">${escapeHtml(g.name)}</h3>
        <table style="width:100%;border-collapse:collapse;">${items}</table>
        <a href="${g.link}" style="display:inline-block;margin-top:10px;color:#2563eb;text-decoration:none;font-weight:600;">View all matches →</a>
      </div>`;
    })
    .join("");

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
    <h2 style="margin:0 0 16px;">New events matching your saved searches</h2>
    <p style="color:#444;margin:0 0 24px;">Here's what's new in Des Moines since we last checked.</p>
    ${sections}
    <p style="color:#888;font-size:13px;margin-top:24px;">Manage your saved searches &amp; alerts in your
      <a href="${SITE_URL}/dashboard?tab=saved-searches" style="color:#2563eb;">dashboard</a>.</p>
  </div>`;

  const textLines: string[] = ["New events matching your saved searches", ""];
  for (const g of groups) {
    textLines.push(`== ${g.name} ==`);
    for (const ev of g.events) textLines.push(`- ${ev.title}${fmtDate(ev.date) ? ` (${fmtDate(ev.date)})` : ""}`);
    textLines.push(`View all: ${g.link}`, "");
  }
  return { html, text: textLines.join("\n") };
}
