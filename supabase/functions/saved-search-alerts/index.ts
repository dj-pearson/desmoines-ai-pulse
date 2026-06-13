/**
 * saved-search-alerts (WEB-FEAT-003)
 *
 * Nightly digest job. For every saved search with alerts enabled it finds
 * events CREATED since that search was last alerted (watermark), matching the
 * saved query + category and still upcoming, groups all matches per user, and
 * sends ONE consolidated email with deep links back to the filtered list and to
 * each matching event. Zero matches → no email. Unsubscribed users are skipped.
 *
 * Runs through the WEB-AUTO-001 jobRunner so the run, counts, and per-tier
 * funnel metadata land in automation_job_runs + the admin Job Health panel.
 * Authoritative gate is requireAdminOrApiKey (cron sends the service-role
 * bearer; an admin can re-run from Job Health) — matches the data-quality-heal
 * precedent, so no config.toml entry is needed.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runJob } from "../_shared/jobRunner.ts";
import { renderEmail } from "../_shared/emailLayout.ts";
import { escapeHtml } from "../_shared/escapeHtml.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://desmoinesinsider.com";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// Bounds so one search / one digest can never blow up.
const MAX_PER_SEARCH = 8;
const MAX_EVENTS_PER_EMAIL = 30;
// First-run lookback when a search has never been alerted before.
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

interface SavedSearchRow {
  id: string;
  user_id: string;
  name: string;
  filters: Record<string, unknown> | null;
  last_alerted_at: string | null;
}

interface MatchedEvent {
  id: string;
  title: string;
  date: string;
  venue: string | null;
  location: string | null;
  category: string | null;
  event_start_utc: string | null;
}

/** Tab → public list route for the "see all" deep link. */
const TAB_PATHS: Record<string, string> = {
  events: "/events",
  restaurants: "/restaurants",
  attractions: "/attractions",
};

/** Strip anything that could break a PostgREST `or` filter; keep it a plain match. */
function sanitizeQuery(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Central-time event slug, matching createEventSlugWithCentralTime / EventDetails. */
function buildEventSlug(title: string, ev: { event_start_utc: string | null; date: string }): string {
  const src = ev.event_start_utc || ev.date;
  let dateStr = "";
  try {
    dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(src));
  } catch {
    dateStr = (ev.date || "").slice(0, 10);
  }
  const titleSlug = (title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${titleSlug}-${dateStr}`;
}

function centralToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatEventDate(ev: MatchedEvent): string {
  try {
    return new Date(ev.event_start_utc || ev.date).toLocaleDateString("en-US", {
      timeZone: "America/Chicago",
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return ev.date;
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get("origin") || undefined;
  const corsHeaders = getCorsHeaders(origin);

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, serviceKey);

  const runStartIso = new Date().toISOString();
  const runStartMs = Date.now();
  const today = centralToday();

  const job = await runJob("saved-search-alerts", async (ctx) => {
    // ---- Load every alert-enabled saved search ----
    const { data: searches, error: searchErr } = await supabase
      .from("saved_searches")
      .select("id, user_id, name, filters, last_alerted_at")
      .eq("filters->>alerts_enabled", "true");
    if (searchErr) throw searchErr;

    const rows = (searches ?? []) as SavedSearchRow[];
    if (rows.length === 0) {
      ctx.meta({ searches: 0, usersEmailed: 0, totalMatches: 0 });
      return { searches: 0, usersEmailed: 0, totalMatches: 0 };
    }

    // ---- Group by user ----
    const byUser = new Map<string, SavedSearchRow[]>();
    for (const r of rows) {
      const list = byUser.get(r.user_id) ?? [];
      list.push(r);
      byUser.set(r.user_id, list);
    }

    // ---- Resolve tier per user (funnel metrics) ----
    const userIds = [...byUser.keys()];
    const tierOf = new Map<string, string>();
    try {
      const { data: subs } = await supabase
        .from("user_subscriptions")
        .select("user_id, status, subscription_plans(name)")
        .in("user_id", userIds)
        .in("status", ["active", "trialing", "past_due"]);
      const rank: Record<string, number> = { vip: 2, insider: 1, free: 0 };
      for (const s of (subs ?? []) as Array<Record<string, unknown>>) {
        const plan = (s.subscription_plans as { name?: string } | null)?.name ?? "free";
        const uid = s.user_id as string;
        if ((rank[plan] ?? 0) > (rank[tierOf.get(uid) ?? "free"] ?? 0)) {
          tierOf.set(uid, plan);
        }
      }
    } catch (e) {
      console.warn("[saved-search-alerts] tier resolution failed:", e);
    }

    const perTier: Record<string, number> = { free: 0, insider: 0, vip: 0 };
    const advancedSearchIds: string[] = [];
    let usersEmailed = 0;
    let totalMatches = 0;
    let emailsFailed = 0;
    let usersSkippedUnsub = 0;

    for (const [userId, userSearches] of byUser) {
      const tier = tierOf.get(userId) ?? "free";

      // Resolve email.
      let email: string | null = null;
      try {
        const { data: u } = await supabase.auth.admin.getUserById(userId);
        email = u?.user?.email ?? null;
      } catch (e) {
        console.warn(`[saved-search-alerts] getUserById failed for ${userId}:`, e);
      }
      if (!email) continue;

      // Respect unsubscribe (notification preferences).
      let unsubscribeToken: string | null = null;
      let unsubscribed = false;
      try {
        const { data: sub } = await supabase
          .from("newsletter_subscribers")
          .select("status, unsubscribe_token")
          .eq("email", email.toLowerCase().trim())
          .maybeSingle();
        unsubscribeToken = (sub?.unsubscribe_token as string) ?? null;
        unsubscribed = (sub?.status as string) === "unsubscribed";
      } catch {
        /* best-effort; default to subscribed */
      }

      // ---- Match each search; dedupe events across the user's searches ----
      const seen = new Set<string>();
      const sections: { name: string; deepLink: string; events: MatchedEvent[] }[] = [];

      for (const search of userSearches) {
        const filters = (search.filters ?? {}) as Record<string, unknown>;
        const tab = typeof filters.tab === "string" ? filters.tab : "events";
        const query = typeof filters.query === "string" ? filters.query : "";
        const params = typeof filters.params === "string" ? filters.params : "";

        // Resolve category from the saved URL params (or a flat filters.category).
        let category = "";
        try {
          const sp = new URLSearchParams(params);
          category = sp.get("category") || (typeof filters.category === "string" ? filters.category : "");
        } catch {
          category = typeof filters.category === "string" ? filters.category : "";
        }

        const cleanQuery = sanitizeQuery(query);
        // Nothing specific to match → skip (would be the whole calendar).
        if (!cleanQuery && !category) {
          advancedSearchIds.push(search.id);
          continue;
        }

        const sinceIso = search.last_alerted_at ?? new Date(runStartMs - DEFAULT_LOOKBACK_MS).toISOString();

        let q = supabase
          .from("events")
          .select("id, title, date, venue, location, category, event_start_utc")
          .gt("created_at", sinceIso)
          .gte("date", today)
          .neq("is_hidden", true)
          .neq("is_merged", true)
          .order("date", { ascending: true })
          .limit(MAX_PER_SEARCH);
        if (cleanQuery) {
          q = q.or(
            `title.ilike.%${cleanQuery}%,venue.ilike.%${cleanQuery}%,location.ilike.%${cleanQuery}%`,
          );
        }
        if (category) q = q.eq("category", category);

        const { data: matched, error: matchErr } = await q;
        if (matchErr) {
          console.warn(`[saved-search-alerts] match failed for search ${search.id}:`, matchErr.message);
          continue; // don't advance — retry next run
        }

        const fresh = ((matched ?? []) as MatchedEvent[]).filter((e) => !seen.has(e.id));
        fresh.forEach((e) => seen.add(e.id));

        const base = TAB_PATHS[tab] ?? "/events";
        const deepLink = params
          ? `${SITE_URL}${base}?${params}`
          : query
            ? `${SITE_URL}${base}?q=${encodeURIComponent(query)}`
            : `${SITE_URL}${base}`;

        if (fresh.length > 0) {
          sections.push({ name: search.name, deepLink, events: fresh });
        }
        advancedSearchIds.push(search.id);
      }

      const userMatchCount = sections.reduce((n, s) => n + s.events.length, 0);
      if (userMatchCount === 0) {
        // Nothing new — watermark already advanced above; no email.
        continue;
      }
      totalMatches += userMatchCount;

      if (unsubscribed) {
        usersSkippedUnsub++;
        continue; // respect opt-out; watermark advanced so we don't re-check
      }

      // ---- Build + send ONE consolidated email ----
      const sent = await sendDigest(email, unsubscribeToken, sections);
      if (sent) {
        usersEmailed++;
        perTier[tier] = (perTier[tier] ?? 0) + 1;
      } else {
        emailsFailed++;
        // Roll back this user's watermarks so the digest retries next night.
        const ids = new Set(userSearches.map((s) => s.id));
        for (let i = advancedSearchIds.length - 1; i >= 0; i--) {
          if (ids.has(advancedSearchIds[i])) advancedSearchIds.splice(i, 1);
        }
      }
    }

    // ---- Advance watermarks for everything we successfully processed ----
    if (advancedSearchIds.length > 0) {
      const unique = [...new Set(advancedSearchIds)];
      for (let i = 0; i < unique.length; i += 200) {
        const chunk = unique.slice(i, i + 200);
        await supabase
          .from("saved_searches")
          .update({ last_alerted_at: runStartIso })
          .in("id", chunk);
      }
    }

    ctx.processed(rows.length);
    ctx.failed(emailsFailed);
    ctx.meta({
      searches: rows.length,
      users: userIds.length,
      usersEmailed,
      usersSkippedUnsub,
      totalMatches,
      emailsFailed,
      perTier,
    });

    return { searches: rows.length, usersEmailed, totalMatches, emailsFailed, perTier };
  });

  return new Response(JSON.stringify(job), {
    status: job.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function sendDigest(
  email: string,
  unsubscribeToken: string | null,
  sections: { name: string; deepLink: string; events: MatchedEvent[] }[],
): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.error("[saved-search-alerts] RESEND_API_KEY not configured");
    return false;
  }

  let remaining = MAX_EVENTS_PER_EMAIL;
  const sectionHtml: string[] = [];
  const sectionText: string[] = [];

  for (const section of sections) {
    if (remaining <= 0) break;
    const events = section.events.slice(0, remaining);
    remaining -= events.length;

    const items = events
      .map((ev) => {
        const eventUrl = `${SITE_URL}/events/${buildEventSlug(ev.title, ev)}`;
        const where = escapeHtml(ev.venue || ev.location || "Des Moines");
        return `
          <div style="padding:12px 0;border-bottom:1px solid #eee;">
            <a href="${eventUrl}" style="color:#2D1B69;font-weight:600;font-size:16px;text-decoration:none;">
              ${escapeHtml(ev.title)}
            </a>
            <div style="font-size:13px;color:#666;margin-top:2px;">
              ${escapeHtml(formatEventDate(ev))} · ${where}
            </div>
          </div>`;
      })
      .join("");

    sectionHtml.push(`
      <div style="margin:24px 0;">
        <h2 style="font-size:18px;color:#2D1B69;margin:0 0 4px;">New matches for “${escapeHtml(section.name)}”</h2>
        ${items}
        <div style="margin-top:12px;">
          <a href="${section.deepLink}" style="color:#DC143C;font-size:14px;text-decoration:none;font-weight:600;">
            See all results →
          </a>
        </div>
      </div>`);

    sectionText.push(
      `New matches for "${section.name}":\n` +
        events.map((ev) => `  • ${ev.title} — ${formatEventDate(ev)}\n    ${SITE_URL}/events/${buildEventSlug(ev.title, ev)}`).join("\n") +
        `\n  See all: ${section.deepLink}`,
    );
  }

  const bodyHtml = `
    <div style="background:linear-gradient(135deg,#2D1B69 0%,#8B0000 50%,#DC143C 100%);padding:28px;text-align:center;border-radius:10px;">
      <h1 style="color:white;margin:0;font-size:22px;">🔔 New events for your saved searches</h1>
    </div>
    <p style="font-size:15px;margin:20px 0 0;">
      Here's what's new in Des Moines that matches the searches you saved:
    </p>
    ${sectionHtml.join("")}
    <p style="font-size:13px;color:#888;margin-top:24px;">
      Manage your saved searches and alerts in your
      <a href="${SITE_URL}/dashboard?tab=saved-searches" style="color:#666;">dashboard</a>.
    </p>`;

  const bodyText =
    `New events for your saved searches\n\n` +
    sectionText.join("\n\n") +
    `\n\nManage your saved searches: ${SITE_URL}/dashboard?tab=saved-searches`;

  const rendered = renderEmail({
    bodyHtml,
    bodyText,
    category: "marketing",
    recipient: {
      email,
      unsubscribeToken,
      preferencesPath: "/dashboard?tab=saved-searches",
    },
  });

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Des Moines Insider <events@desmoinesinsider.com>",
        to: [email],
        subject: "New events matching your saved searches",
        html: rendered.html,
        text: rendered.text,
        headers: rendered.listUnsubscribe
          ? {
              "List-Unsubscribe": rendered.listUnsubscribe,
              "List-Unsubscribe-Post": rendered.listUnsubscribePost ?? "",
            }
          : undefined,
        tags: [{ name: "type", value: "saved_search_digest" }],
      }),
    });
    if (!response.ok) {
      console.error("[saved-search-alerts] Resend error:", await response.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[saved-search-alerts] send failed:", e);
    return false;
  }
}
