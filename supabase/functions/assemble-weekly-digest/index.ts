/**
 * Assemble Weekly Digest (WEB-AUTO-008)
 *
 * Zero-touch recurring newsletter. A weekly pg_cron job (Tuesday ~9am Central,
 * migration 20260612000014) invokes this function, which:
 *   1. honours an admin pause flag (system_settings.weekly_digest.paused)
 *   2. de-dupes — at most one auto digest per 6 days
 *   3. assembles content automatically: top upcoming events (next 7 days),
 *      trending restaurants, and the newest published article
 *   4. runs PRE-SEND VALIDATION GATES (recipients > 0, content present, all
 *      links structurally resolve, subject under length cap); any hard gate
 *      failure ABORTS (no campaign created) and alerts via the jobRunner
 *   5. creates a status='scheduled' newsletter_campaigns row (scheduled_for=now)
 *      so the EXISTING dispatch-scheduled-newsletters worker sends it — so
 *      unsubscribe / CAN-SPAM / delivery tracking / bounce-complaint webhooks
 *      are byte-for-byte identical to a human-composed campaign.
 *
 * Actions (POST body { action }):
 *   - (default / 'assemble') → run the full pipeline, queue the campaign
 *   - 'preview'              → assemble + run gates and RETURN the subject/HTML
 *                             WITHOUT creating a campaign (admin "preview next
 *                             week's digest"). Ignores the pause flag.
 *
 * Auth: requireAdminOrApiKey (cron service-role bearer + admin re-run/preview
 * JWT both pass). Runs under default verify_jwt=true — NOT added to config.toml,
 * matching the data-quality-heal / dedupe-content / auto-article-pipeline
 * precedent.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runJob } from "../_shared/jobRunner.ts";
import { escapeHtml } from "../_shared/escapeHtml.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://desmoinesinsider.com";
const SUBJECT_MAX = 120; // keep well under inbox truncation
const DEDUPE_WINDOW_DAYS = 6;
const MAX_EVENTS = 8;
const MAX_RESTAURANTS = 4;

interface EventRow {
  id: string;
  title: string;
  date: string;
  event_start_utc: string | null;
  location: string | null;
  category: string | null;
  image_url: string | null;
}
interface RestaurantRow {
  id: string;
  name: string;
  slug: string | null;
  cuisine: string | null;
  rating: number | null;
  is_featured: boolean | null;
}
interface ArticleRow {
  title: string;
  slug: string | null;
  excerpt: string | null;
  published_at: string | null;
}

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

/** Slugify exactly like createEventSlugWithCentralTime (src/lib/timezone.ts):
 *  title slug + `-YYYY-MM-DD` using the event's Central-time calendar date,
 *  preferring event_start_utc over date. Guarantees the link resolves in
 *  EventDetails, which matches on this exact slug. */
function eventSlug(ev: EventRow): string {
  const titleSlug = ev.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const dateSource = ev.event_start_utc ?? ev.date;
  if (!dateSource) return titleSlug;
  try {
    // en-CA renders ISO YYYY-MM-DD; timeZone pins it to Central calendar date.
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(dateSource));
    return `${titleSlug}-${ymd}`;
  } catch {
    return titleSlug;
  }
}

function simpleSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatEventDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

interface DigestContent {
  events: EventRow[];
  restaurants: RestaurantRow[];
  article: ArticleRow | null;
}

async function assembleContent(
  supabase: ReturnType<typeof createClient>,
): Promise<DigestContent> {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nowIso = now.toISOString();
  const in7Iso = in7.toISOString();

  // Top upcoming events in the next 7 days (exclude hidden/merged per
  // WEB-AUTO-005/006). Ordered by date so soonest lead.
  const { data: events } = await supabase
    .from("events")
    .select("id, title, date, event_start_utc, location, category, image_url")
    .neq("is_hidden", true)
    .neq("is_merged", true)
    .gte("date", nowIso)
    .lte("date", in7Iso)
    .order("date", { ascending: true })
    .limit(MAX_EVENTS);

  // Trending restaurants: featured first, then highest rated.
  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, name, slug, cuisine, rating, is_featured")
    .neq("is_merged", true)
    .order("is_featured", { ascending: false })
    .order("rating", { ascending: false, nullsFirst: false })
    .limit(MAX_RESTAURANTS);

  // Newest published article.
  const { data: articles } = await supabase
    .from("articles")
    .select("title, slug, excerpt, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(1);

  return {
    events: (events ?? []) as unknown as EventRow[],
    restaurants: (restaurants ?? []) as unknown as RestaurantRow[],
    article: ((articles ?? [])[0] as unknown as ArticleRow) ?? null,
  };
}

async function activeSubscriberCount(
  supabase: ReturnType<typeof createClient>,
): Promise<number> {
  const { count } = await supabase
    .from("newsletter_subscribers")
    .select("email", { count: "exact", head: true })
    .eq("status", "active");
  return count ?? 0;
}

function buildSubject(content: DigestContent): string {
  const n = content.events.length;
  const lead = content.events[0]?.title;
  let subject = lead
    ? `This Week in Des Moines: ${lead}${n > 1 ? ` + ${n - 1} more` : ""}`
    : `This Week in Des Moines`;
  if (subject.length > SUBJECT_MAX) {
    subject = subject.slice(0, SUBJECT_MAX - 1).trimEnd() + "…";
  }
  return subject;
}

function eventCardHtml(ev: EventRow): string {
  const url = `${SITE_URL}/events/${eventSlug(ev)}`;
  const meta = [
    ev.location ? `📍 ${escapeHtml(ev.location)}` : "",
    `📆 ${escapeHtml(formatEventDate(ev.date))}`,
    ev.category ? escapeHtml(ev.category) : "",
  ].filter(Boolean).join(" &nbsp;•&nbsp; ");
  return `
    <div style="background:#f9f9f9;border-left:4px solid #667eea;border-radius:8px;padding:14px;margin-bottom:12px;">
      <div style="font-size:16px;font-weight:bold;color:#333;margin-bottom:6px;">${escapeHtml(ev.title)}</div>
      <div style="font-size:13px;color:#666;margin-bottom:8px;">${meta}</div>
      <a href="${url}" style="display:inline-block;padding:8px 16px;background:#667eea;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:bold;">View event</a>
    </div>`;
}

function restaurantLineHtml(r: RestaurantRow): string {
  const slug = r.slug || simpleSlug(r.name);
  const url = `${SITE_URL}/restaurants/${slug}`;
  const bits = [
    r.cuisine ? escapeHtml(r.cuisine) : "",
    r.rating ? `★ ${r.rating.toFixed(1)}` : "",
  ].filter(Boolean).join(" • ");
  return `<li style="margin-bottom:8px;"><a href="${url}" style="color:#667eea;font-weight:bold;text-decoration:none;">${escapeHtml(r.name)}</a>${bits ? ` <span style="color:#888;font-size:13px;">— ${bits}</span>` : ""}</li>`;
}

function buildBodyHtml(content: DigestContent): string {
  const { events, restaurants, article } = content;

  const eventsSection = events.length
    ? `<div style="margin:28px 0;">
         <div style="font-size:20px;font-weight:bold;color:#667eea;margin-bottom:14px;">📅 Happening this week</div>
         ${events.map(eventCardHtml).join("")}
       </div>`
    : "";

  const restaurantsSection = restaurants.length
    ? `<div style="margin:28px 0;">
         <div style="font-size:20px;font-weight:bold;color:#667eea;margin-bottom:14px;">🍽️ Trending restaurants</div>
         <ul style="padding-left:20px;margin:0;">${restaurants.map(restaurantLineHtml).join("")}</ul>
       </div>`
    : "";

  const articleSection = article && article.slug
    ? `<div style="margin:28px 0;">
         <div style="font-size:20px;font-weight:bold;color:#667eea;margin-bottom:14px;">📰 From the blog</div>
         <div style="background:#f9f9f9;border-radius:8px;padding:14px;">
           <a href="${SITE_URL}/articles/${article.slug}" style="font-size:16px;font-weight:bold;color:#333;text-decoration:none;">${escapeHtml(article.title)}</a>
           ${article.excerpt ? `<p style="font-size:13px;color:#666;margin:8px 0 0;">${escapeHtml(article.excerpt)}</p>` : ""}
         </div>
       </div>`
    : "";

  // CAN-SPAM footer: postal address + functioning unsubscribe link. Mirrors
  // the shared emailLayout footer; the bulk dispatch path sends one body to
  // all recipients, so we use the public token-less /unsubscribe page.
  const footer = `
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center;">
      <p style="margin:4px 0;">Des Moines Insider · Des Moines, Iowa, USA</p>
      <p style="margin:4px 0;">You're receiving this because you subscribed to Des Moines Insider updates.</p>
      <p style="margin:4px 0;"><a href="${SITE_URL}/unsubscribe" style="color:#667eea;">Unsubscribe</a> · <a href="${SITE_URL}/events" style="color:#667eea;">Browse all events</a></p>
    </div>`;

  return `
  <div style="max-width:600px;margin:0 auto;background:#fff;font-family:Arial,Helvetica,sans-serif;">
    <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:28px 20px;text-align:center;">
      <h1 style="margin:0;font-size:26px;">🌆 Your Des Moines Week</h1>
      <p style="margin:6px 0 0;opacity:.9;">Des Moines Insider weekly digest</p>
    </div>
    <div style="padding:24px 20px;">
      <p style="font-size:16px;">Here's what's worth your time in Des Moines this week.</p>
      ${eventsSection}
      ${restaurantsSection}
      ${articleSection}
      <div style="text-align:center;margin:28px 0;">
        <a href="${SITE_URL}/events" style="display:inline-block;padding:12px 24px;background:#667eea;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">See everything →</a>
      </div>
      ${footer}
    </div>
  </div>`;
}

interface GateResult {
  passed: boolean;
  reasons: string[];
  recipientCount: number;
  linkCount: number;
}

async function runGates(
  supabase: ReturnType<typeof createClient>,
  content: DigestContent,
  subject: string,
): Promise<GateResult> {
  const reasons: string[] = [];

  const recipientCount = await activeSubscriberCount(supabase);
  if (recipientCount <= 0) {
    reasons.push("No active subscribers — segment resolves to 0 recipients.");
  }

  // Content present: the digest is event-centric; require at least one piece
  // of content so we never send an empty email.
  const linkCount =
    content.events.length +
    content.restaurants.length +
    (content.article && content.article.slug ? 1 : 0);
  if (content.events.length === 0) {
    reasons.push("No upcoming events in the next 7 days.");
  }
  if (linkCount === 0) {
    reasons.push("No content (events/restaurants/article) available to send.");
  }

  // All content links resolve: links are built from existing DB rows (id/slug),
  // so they resolve by construction. Verify each carries a non-empty slug.
  const badEvent = content.events.find((e) => !eventSlug(e));
  if (badEvent) reasons.push(`Event "${badEvent.title}" produced an empty slug.`);

  // Subject under length cap (buildSubject already truncates, so this is a
  // belt-and-suspenders assertion).
  if (!subject || subject.length === 0) {
    reasons.push("Subject line is empty.");
  }
  if (subject.length > SUBJECT_MAX) {
    reasons.push(`Subject exceeds ${SUBJECT_MAX} chars.`);
  }

  return { passed: reasons.length === 0, reasons, recipientCount, linkCount };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") ?? undefined);

  const authFail = await requireAdminOrApiKey(req, corsHeaders);
  if (authFail) return authFail;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = (body.action as string) ?? "assemble";
  const supabase = serviceClient();

  // ---- PREVIEW: assemble + gate, return without creating a campaign --------
  if (action === "preview") {
    try {
      const content = await assembleContent(supabase);
      const subject = buildSubject(content);
      const gates = await runGates(supabase, content, subject);
      const bodyHtml = buildBodyHtml(content);
      return new Response(
        JSON.stringify({
          ok: true,
          preview: true,
          subject,
          body_html: bodyHtml,
          recipient_count: gates.recipientCount,
          gates_passed: gates.passed,
          gate_reasons: gates.reasons,
          counts: {
            events: content.events.length,
            restaurants: content.restaurants.length,
            article: content.article ? 1 : 0,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ ok: false, error: message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // ---- ASSEMBLE + QUEUE (the cron path), wrapped in the jobRunner ----------
  const result = await runJob("assemble-weekly-digest", async (ctx) => {
    // Pause flag — admin can stop the recurrence with one toggle, no deploy.
    const { data: setting } = await supabase
      .from("system_settings")
      .select("settings")
      .eq("setting_type", "weekly_digest")
      .maybeSingle();
    const paused = Boolean(
      (setting as { settings?: { paused?: boolean } } | null)?.settings?.paused,
    );
    if (paused) {
      ctx.meta({ skipped: "paused" });
      return { skipped: "paused" };
    }

    // Idempotency — at most one auto digest per DEDUPE_WINDOW_DAYS, so a
    // double cron firing (or a manual re-run after the weekly send) can't
    // queue two.
    const cutoff = new Date(
      Date.now() - DEDUPE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: recent } = await supabase
      .from("newsletter_campaigns")
      .select("id")
      .eq("campaign_type", "weekly_digest")
      .gte("created_at", cutoff)
      .limit(1);
    if (recent && recent.length > 0) {
      ctx.meta({ skipped: "already_assembled_this_week" });
      return { skipped: "already_assembled_this_week" };
    }

    const content = await assembleContent(supabase);
    const subject = buildSubject(content);
    const gates = await runGates(supabase, content, subject);

    ctx.meta({
      subject,
      recipientCount: gates.recipientCount,
      events: content.events.length,
      restaurants: content.restaurants.length,
      article: content.article ? 1 : 0,
      linkCount: gates.linkCount,
    });

    // PRE-SEND VALIDATION GATE: any hard failure aborts the send (no campaign
    // created) and — by throwing inside the jobRunner — triggers the admin
    // alert. A broken/empty digest never goes out.
    if (!gates.passed) {
      throw new Error(
        `Weekly digest aborted by pre-send gates: ${gates.reasons.join(" ")}`,
      );
    }

    const bodyHtml = buildBodyHtml(content);

    // Queue as a scheduled campaign (scheduled_for=now) so the existing
    // dispatch-scheduled-newsletters worker sends it through the identical
    // unsubscribe/compliance/webhook path.
    const { data: campaign, error: insertError } = await supabase
      .from("newsletter_campaigns")
      .insert({
        subject,
        preheader: "Your weekly roundup of Des Moines events, food & reads.",
        body_html: bodyHtml,
        segment: {}, // all active subscribers
        status: "scheduled",
        scheduled_for: new Date().toISOString(),
        recipient_count: gates.recipientCount,
        sent_by: null, // system-authored
        campaign_type: "weekly_digest",
      })
      .select("id")
      .single();
    if (insertError || !campaign) {
      throw new Error(
        `Failed to create digest campaign: ${insertError?.message ?? "unknown"}`,
      );
    }

    ctx.processed(gates.recipientCount);
    ctx.meta({ campaignId: campaign.id, queued: true });
    return {
      queued: true,
      campaignId: campaign.id,
      recipientCount: gates.recipientCount,
    };
  });

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
