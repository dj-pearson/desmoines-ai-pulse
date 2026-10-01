/**
 * saved-search-alerts (WEB-FEAT-003)
 *
 * Nightly event-alert digest. Runs every active event-list saved search against
 * events created since that search's last run, groups matches per user, and sends
 * ONE consolidated email per user. Each event links to its own page and each
 * search to the filtered /events URL. jobRunner-wrapped (WEB-AUTO-001) so runs
 * are observable and failures alert.
 *
 * Matching lives in _shared/savedSearchMatch.ts and follows the /events hub
 * (docs/page-plans/search.md WP5): area slugs by city or coordinates, the
 * iOS `query` key, the date preset or from/to in Central, per-word queries.
 *
 * Respects preferences: skips users with event_alerts_enabled=false or no
 * email; zero matches = no email. A search's last_alerted_at advances only when
 * it had no matches or its owner's email went out (or was skipped on purpose),
 * so a failed send is retried the next night instead of being marked
 * delivered. The window never reaches back more than 7 days.
 *
 * Auth: verify_jwt=false; does its own auth via requireAdminOrApiKey (cron
 * service-role key or admin JWT). Trigger: pg_cron nightly.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runJob } from "../_shared/jobRunner.ts";
import { listUnsubscribeHeaders, renderEmail, SITE_URL } from "../_shared/emailLayout.ts";
import { resolveEmailProvider, sendEmail } from "../_shared/email.ts";
import { hasFeatureAccess, resolveEntitledTiers } from "../_shared/entitlements.ts";
import {
  type AlertEvent,
  type AlertGroup,
  alertWindowStart,
  buildEmail,
  deepLink,
  type DeliveryOutcome,
  matchesSavedSearch,
  searchIdsToAdvance,
  uniqueEventCount,
  upcomingFloorIso,
} from "../_shared/savedSearchMatch.ts";

const MAX_EVENTS_PER_SEARCH = 8;

/**
 * Columns for matching and linking. latitude/longitude make the bbox areas
 * work; event_start_utc builds the event's slug; the two descriptions are
 * searched with the title, venue, location and city.
 */
const EVENT_COLUMNS =
  "id, title, date, end_date, event_start_utc, category, location, venue, city, price, latitude, longitude, original_description, enhanced_description, created_at";

interface SavedSearch {
  id: string;
  user_id: string;
  name: string;
  filters: Record<string, unknown> | null;
  last_alerted_at: string | null;
}

interface ProfileRow {
  user_id: string;
  email: string | null;
}

interface PrefRow {
  user_id: string;
  event_alerts_enabled: boolean | null;
}

interface SubscriberRow {
  unsubscribe_token: string | null;
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
    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Active event-list saved searches.
    const { data: searchesRaw, error: searchesError } = await supabase
      .from("saved_searches")
      .select("id, user_id, name, filters, last_alerted_at")
      .eq("search_type", "event_list")
      .eq("alerts_enabled", true);
    // A failed read here returns zero searches, and the job then reports
    // `{ searches: 0 }` as a SUCCESS - a nightly cron that has stopped working
    // looks exactly like a night with nothing to send (WEB-BE-032 AC2).
    if (searchesError) throw new Error(`saved_searches read failed: ${searchesError.message}`);
    const allSearches = (searchesRaw ?? []) as SavedSearch[];
    if (allSearches.length === 0) {
      ctx.meta({ searches: 0 });
      return { searches: 0, emailsSent: 0 };
    }

    // 1b. WEB-FEAT-017 -- ALERTS ARE AN INSIDER FEATURE AND THIS JOB NEVER ASKED.
    //
    // It mailed every row in saved_searches. The free plan's alerts limit is 0
    // and create_alerts is insider+, so a row belonging to a free account is
    // either a client-side check that was bypassed or a subscription that has
    // since lapsed -- and in both cases we were delivering a paid feature for
    // free, nightly. Nothing shipped depends on the old behaviour: free users
    // have never been entitled to alerts, so no client can be relying on them.
    const ownerIds = [...new Set(allSearches.map((s) => s.user_id))];
    // resolveEntitledTiers THROWS on a failed read rather than returning an
    // empty map, so a broken subscription read fails the run instead of quietly
    // skipping every alert -- and a genuinely unentitled night still reports
    // zero sends rather than raising.
    const tiers = await resolveEntitledTiers(supabase, ownerIds);
    const searches = allSearches.filter((s) =>
      hasFeatureAccess(tiers.get(s.user_id) ?? "free", "create_alerts"),
    );
    const skippedUnentitled = allSearches.length - searches.length;
    if (searches.length === 0) {
      ctx.meta({ searches: 0, skippedUnentitled });
      return { searches: 0, emailsSent: 0, skippedUnentitled };
    }

    // 2. Candidate events created since the earliest window across all
    //    searches (each clamped to 7 days), with the hub's visibility and
    //    "upcoming" rules: started today in Central, or still running.
    const windowStart = new Map<string, number>();
    let earliest = now.getTime();
    for (const s of searches) {
      const t = alertWindowStart(s.last_alerted_at, now);
      windowStart.set(s.id, t);
      if (t < earliest) earliest = t;
    }
    const { data: eventsRaw, error: eventsError } = await supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .gte("created_at", new Date(earliest).toISOString())
      .or(`date.gte.${upcomingFloorIso(now)},end_date.gte.${nowIso}`)
      .neq("is_merged", true)
      .neq("is_hidden", true)
      // WEB-BE-034: the other unpublish switch, or an alert mails an event
      // the sweep has already retired.
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(500);
    // Same shape: no events means no alerts, which is indistinguishable from a
    // quiet night unless the failure is raised.
    if (eventsError) throw new Error(`events read failed: ${eventsError.message}`);
    const events = (eventsRaw ?? []) as AlertEvent[];

    // 3. Per-user accumulation of matched searches.
    const perUser = new Map<string, AlertGroup[]>();
    const matchedSearchIds = new Set<string>();
    for (const s of searches) {
      const since = windowStart.get(s.id) ?? now.getTime();
      const matched = events.filter(
        (ev) => new Date(ev.created_at).getTime() >= since && matchesSavedSearch(ev, s.filters, now),
      );
      if (matched.length > 0) {
        matchedSearchIds.add(s.id);
        const list = perUser.get(s.user_id) ?? [];
        list.push({ name: s.name, link: deepLink(s.filters, SITE_URL), events: matched });
        perUser.set(s.user_id, list);
      }
    }

    // 4. Resolve recipients (email on file + alerts opted in) and send.
    let emailsSent = 0;
    let failed = 0;
    const userIds = [...perUser.keys()];
    const outcomes = new Map<string, DeliveryOutcome>();

    if (userIds.length > 0) {
      // Matches are waiting and nothing can send them. Advancing the window
      // here would drop them for good, so the run fails and alerts instead.
      if (resolveEmailProvider().kind === "none") {
        throw new Error(`no email provider configured; ${userIds.length} user(s) have matches pending`);
      }

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        // profiles has NO email_verified column - confirmed 42703 against
        // production - so this select failed and, since WEB-BE-032 made the
        // failure raise, the whole nightly run aborted. Before that it fell to
        // an empty list and sent nothing, silently.
        // KEYED ON user_id, NOT id. userIds comes from saved_searches.user_id,
        // which is the AUTH user id. profiles has both columns and they are
        // different values - 0 of 6 rows have id = user_id - so `.in("id", ...)`
        // matched nothing and this run resolved zero recipients even once the
        // email_verified column error above was fixed. The very next query in
        // this block already keys on user_id; they disagreed with each other.
        .select("user_id, email")
        .in("user_id", userIds);
      if (profilesError) {
        // Fails closed already - `profiles ?? []` sends nothing - but silently,
        // so a run that reached zero recipients looked identical to a run with
        // no matches (WEB-BE-032 AC2).
        throw new Error(`profiles read failed: ${profilesError.message}`);
      }

      const { data: prefs, error: prefsError } = await supabase
        .from("user_email_preferences")
        .select("user_id, event_alerts_enabled")
        .in("user_id", userIds);
      if (prefsError) {
        // THIS ONE FAILED OPEN. The opt-out test below is `prefMap.get(uid) ===
        // false`, and a dropped error leaves prefMap EMPTY, so every entry reads
        // as undefined and every user is treated as opted in. One transient read
        // failure mails everyone who had turned event alerts off.
        //
        // Not sendable without knowing who opted out, so the run fails and
        // retries rather than guessing.
        throw new Error(`user_email_preferences read failed: ${prefsError.message}`);
      }

      const prefMap = new Map<string, boolean>();
      for (const p of (prefs ?? []) as PrefRow[]) prefMap.set(p.user_id, p.event_alerts_enabled !== false);

      const emailByUser = new Map<string, string>();
      for (const p of (profiles ?? []) as ProfileRow[]) {
        if (p.email) emailByUser.set(p.user_id, p.email);
      }

      for (const uid of userIds) {
        // THE VERIFICATION GATE IS GONE BECAUSE IT NEVER EXISTED. Nothing in
        // the schema records whether an address is confirmed, so there is no
        // column to read and no honest way to keep the check. Recipients are
        // users who saved a search and enabled alerts on their own account,
        // which is the consent this send rests on. If verification is wanted,
        // it needs a column first - recorded rather than silently dropped.
        const email = emailByUser.get(uid);
        if (!email || prefMap.get(uid) === false) {
          // Nothing to retry: no address, or the user turned alerts off.
          outcomes.set(uid, "skipped");
          continue;
        }
        const allGroups = perUser.get(uid) ?? [];
        const groups = allGroups.map((g) => ({ ...g, events: g.events.slice(0, MAX_EVENTS_PER_SEARCH) }));

        // Best-effort: the token only personalises the unsubscribe link, and
        // renderEmail still emits a working generic one without it. Logged so a
        // run that quietly drops every token is visible (WEB-BE-032 AC3).
        const { data: sub, error: subError } = await supabase
          .from("newsletter_subscribers")
          .select("unsubscribe_token")
          .eq("email", email.toLowerCase().trim())
          .maybeSingle();
        if (subError) {
          console.warn(`[saved-search-alerts] unsubscribe token read failed: ${subError.message}`);
        }
        const token = (sub as SubscriberRow | null)?.unsubscribe_token ?? null;

        // Distinct events across all of this user's matches: one event that
        // fits two searches is one new event, not two.
        const totalNew = uniqueEventCount(allGroups);
        const { html, text } = buildEmail(groups, SITE_URL);
        const rendered = renderEmail({
          bodyHtml: html,
          bodyText: text,
          category: "marketing",
          recipient: { email, unsubscribeToken: token, preferencesPath: "/dashboard?tab=saved-searches" },
        });

        const sent = await sendEmail(
          {
            to: email,
            from: "Des Moines Insider <events@desmoinesinsider.com>",
            subject: `${totalNew} new event${totalNew === 1 ? "" : "s"} matching your saved search${
              allGroups.length === 1 ? "" : "es"
            }`,
            html: rendered.html,
            text: rendered.text,
            category: "marketing",
            template: "saved_search_alert",
            headers: listUnsubscribeHeaders(rendered),
            userId: uid,
          },
          { supabase },
        );
        // A suppressed address (bounced, complained, unsubscribed) is not a
        // failure to retry tomorrow: it would hold the window forever.
        const outcome: DeliveryOutcome = sent.ok
          ? "sent"
          : (sent.suppressed?.length ?? 0) > 0
          ? "skipped"
          : "failed";
        if (outcome === "failed") console.error(`[saved-search-alerts] send failed for user ${uid}: ${sent.error}`);
        if (outcome === "skipped") {
          outcomes.set(uid, outcome);
          continue;
        }
        outcomes.set(uid, outcome);
        if (outcome === "sent") emailsSent++;
        else failed++;
      }
    }

    // 5. Advance the window for searches that had no matches or whose owner's
    //    email went out. A failed send keeps its window, so tomorrow retries it.
    const ids = searchIdsToAdvance(searches, matchedSearchIds, outcomes);
    if (ids.length > 0) {
      const { error: advanceError } = await supabase
        .from("saved_searches")
        // The client has no Database generic, so supabase-js 2.10x types an
        // update payload as `never`; the column is in scripts/db-snapshot.json.
        .update({ last_alerted_at: nowIso } as never)
        .in("id", ids);
      // Unchecked, a failed update re-sent the same events every night while
      // the run reported success.
      if (advanceError) throw new Error(`saved_searches last_alerted_at update failed: ${advanceError.message}`);
    }

    ctx.processed(emailsSent);
    ctx.failed(failed);
    ctx.meta({
      searches: searches.length,
      // Counted rather than silently dropped: a jump here is a client-side
      // check being bypassed, and a run that alerts nobody because everyone
      // lapsed should not look like a quiet night.
      skippedUnentitled,
      candidateEvents: events.length,
      usersWithMatches: userIds.length,
      emailsSent,
      sendFailures: failed,
      searchesAdvanced: ids.length,
      searchesHeldForRetry: searches.length - ids.length,
      emailProvider: resolveEmailProvider().kind,
    });
    return {
      searches: searches.length,
      skippedUnentitled,
      emailsSent,
      sendFailures: failed,
      usersWithMatches: userIds.length,
    };
  });

  return new Response(
    JSON.stringify({ ok: job.ok, status: job.status, runId: job.runId, result: job.result, error: job.error }),
    { status: job.ok ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
