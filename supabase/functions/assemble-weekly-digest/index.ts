/**
 * assemble-weekly-digest (WEB-AUTO-008)
 *
 * Self-running weekly digest newsletter. Replaces the manual "compose +
 * schedule a campaign every Tuesday" chore:
 *
 *   1. pause check — feature_flags.weekly_digest_enabled,
 *   2. idempotency — skip if a weekly_digest campaign was already created
 *      in the last 6 days (a second cron firing / manual retry is a no-op),
 *   3. assemble — top upcoming events (next 7 days), top-rated restaurants,
 *      and the newest published article into the shared marketing email
 *      layout,
 *   4. pre-send validation gates — recipient segment > 0, subject within the
 *      length cap, at least one content item, every content link a well-formed
 *      https URL under the site origin; ANY gate failure aborts (no campaign
 *      row created) and surfaces as a terminal jobRunner failure that alerts
 *      the admin (WEB-AUTO-001) — we never schedule a broken email,
 *   5. schedule — insert a newsletter_campaigns row (status='scheduled',
 *      scheduled_for=now(), campaign_type='weekly_digest'). The existing
 *      dispatch-scheduled-newsletters cron picks it up within ~1 minute and
 *      sends it through the identical Resend path, so unsubscribe/compliance
 *      handling and delivery webhooks are unchanged.
 *
 * Actions (POST body { action }):
 *   - 'assemble' (default; cron)  → run the pipeline above (jobRunner-wrapped).
 *   - 'preview'                    → assemble only and return the subject +
 *                                    body_html + content counts WITHOUT
 *                                    creating a campaign (admin "preview next
 *                                    week's digest" button).
 *
 * Pause: an admin flips feature_flags.weekly_digest_enabled off in the Email
 * admin UI. Auth: requireAdminOrApiKey (cron service-role bearer + admin JWT
 * both pass; anon rejected).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { requireAdminOrApiKey } from '../_shared/apiKeyAuth.ts';
import { runJob } from '../_shared/jobRunner.ts';
import { renderEmail, SITE_URL } from '../_shared/emailLayout.ts';
import { escapeHtml } from '../_shared/escapeHtml.ts';

const PAUSE_FLAG = 'weekly_digest_enabled';
const SUBJECT_MAX = 120;        // inbox-safe subject cap
const DEDUPE_DAYS = 6;          // one digest per ~week
const MAX_EVENTS = 6;
const MAX_RESTAURANTS = 4;

type SupabaseClient = ReturnType<typeof createClient>;

interface EventRow {
  id: string;
  title: string;
  date: string;
  location: string | null;
  venue: string | null;
  category: string | null;
}

interface RestaurantRow {
  id: string;
  name: string;
  slug: string | null;
  cuisine: string | null;
  location: string | null;
  rating: number | null;
}

interface ArticleRow {
  title: string;
  slug: string;
  excerpt: string | null;
  published_at: string | null;
}

interface DigestContent {
  events: EventRow[];
  restaurants: RestaurantRow[];
  article: ArticleRow | null;
}

// Mirrors createSlug in send-weekly-digest — events resolve by a title slug.
function createSlug(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function eventUrl(e: EventRow): string {
  return `${SITE_URL}/events/${createSlug(e.title)}`;
}
function restaurantUrl(r: RestaurantRow): string {
  return `${SITE_URL}/restaurants/${r.slug || r.id}`;
}
function articleUrl(a: ArticleRow): string {
  return `${SITE_URL}/articles/${a.slug}`;
}

function formatEventDate(iso: string): string {
  // America/Chicago, date-only string (no extra tz lib needed for a date).
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Chicago',
  });
}

async function gatherContent(supabase: SupabaseClient): Promise<DigestContent> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const weekOut = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Top upcoming events in the next 7 days (featured first, then soonest).
  const { data: events } = await supabase
    .from('events')
    .select('id, title, date, location, venue, category')
    .gte('date', todayStr)
    .lte('date', weekOut)
    .neq('is_hidden', true)
    .neq('is_merged', true)
    .order('is_featured', { ascending: false, nullsFirst: false })
    .order('date', { ascending: true })
    .limit(MAX_EVENTS);

  // Top-rated / featured restaurants (no live "trending" metric exists; rating
  // + featured is the best available signal).
  const { data: restaurants } = await supabase
    .from('restaurants')
    .select('id, name, slug, cuisine, location, rating')
    .neq('is_merged', true)
    .order('is_featured', { ascending: false, nullsFirst: false })
    .order('rating', { ascending: false, nullsFirst: false })
    .limit(MAX_RESTAURANTS);

  // Newest published article.
  const { data: article } = await supabase
    .from('articles')
    .select('title, slug, excerpt, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return {
    events: (events ?? []) as unknown as EventRow[],
    restaurants: (restaurants ?? []) as unknown as RestaurantRow[],
    article: (article ?? null) as unknown as ArticleRow | null,
  };
}

function buildSubject(content: DigestContent): string {
  const lead = content.events[0]?.title;
  const base = lead
    ? `This week in Des Moines: ${lead} & more`
    : 'This week in Des Moines';
  return base.length > SUBJECT_MAX ? `${base.slice(0, SUBJECT_MAX - 1)}…` : base;
}

function buildBodyHtml(content: DigestContent): string {
  const sections: string[] = [];

  sections.push(`
    <h1 style="font-size:22px;margin:0 0 4px;">This week in Des Moines</h1>
    <p style="color:#666;margin:0 0 24px;">Your weekly roundup of what's happening around the metro.</p>
  `);

  if (content.events.length > 0) {
    const items = content.events
      .map(
        (e) => `
        <div style="margin:0 0 16px;padding:0 0 16px;border-bottom:1px solid #eee;">
          <a href="${eventUrl(e)}" style="font-size:16px;font-weight:600;color:#1a73e8;text-decoration:none;">${escapeHtml(e.title)}</a>
          <div style="font-size:13px;color:#666;margin-top:2px;">
            ${escapeHtml(formatEventDate(e.date))}${
              e.venue || e.location
                ? ` · ${escapeHtml(e.venue || e.location || '')}`
                : ''
            }
          </div>
        </div>`,
      )
      .join('');
    sections.push(`
      <h2 style="font-size:18px;margin:0 0 12px;">📅 Upcoming events</h2>
      ${items}
      <p style="margin:0 0 28px;"><a href="${SITE_URL}/events" style="color:#1a73e8;">Browse all events →</a></p>
    `);
  }

  if (content.restaurants.length > 0) {
    const items = content.restaurants
      .map(
        (r) => `
        <div style="margin:0 0 12px;">
          <a href="${restaurantUrl(r)}" style="font-size:15px;font-weight:600;color:#1a73e8;text-decoration:none;">${escapeHtml(r.name)}</a>
          <span style="font-size:13px;color:#666;">${
            r.cuisine ? ` · ${escapeHtml(r.cuisine)}` : ''
          }${r.rating ? ` · ★ ${r.rating.toFixed(1)}` : ''}</span>
        </div>`,
      )
      .join('');
    sections.push(`
      <h2 style="font-size:18px;margin:0 0 12px;">🍽️ Top-rated restaurants</h2>
      ${items}
      <p style="margin:0 0 28px;"><a href="${SITE_URL}/restaurants" style="color:#1a73e8;">Explore restaurants →</a></p>
    `);
  }

  if (content.article) {
    const a = content.article;
    sections.push(`
      <h2 style="font-size:18px;margin:0 0 12px;">📰 From the blog</h2>
      <a href="${articleUrl(a)}" style="font-size:16px;font-weight:600;color:#1a73e8;text-decoration:none;">${escapeHtml(a.title)}</a>
      ${a.excerpt ? `<p style="font-size:14px;color:#444;margin:6px 0 0;">${escapeHtml(a.excerpt)}</p>` : ''}
      <p style="margin:12px 0 28px;"><a href="${articleUrl(a)}" style="color:#1a73e8;">Read more →</a></p>
    `);
  }

  return sections.join('\n');
}

function buildBodyText(content: DigestContent): string {
  const lines: string[] = ['This week in Des Moines', ''];
  if (content.events.length > 0) {
    lines.push('Upcoming events:');
    for (const e of content.events) {
      lines.push(`- ${e.title} (${formatEventDate(e.date)}) ${eventUrl(e)}`);
    }
    lines.push('');
  }
  if (content.restaurants.length > 0) {
    lines.push('Top-rated restaurants:');
    for (const r of content.restaurants) {
      lines.push(`- ${r.name} ${restaurantUrl(r)}`);
    }
    lines.push('');
  }
  if (content.article) {
    lines.push(`From the blog: ${content.article.title} ${articleUrl(content.article)}`);
  }
  return lines.join('\n');
}

/** Every internal link must be a well-formed https URL under the site origin. */
function linksResolve(content: DigestContent): boolean {
  const urls = [
    ...content.events.map(eventUrl),
    ...content.restaurants.map(restaurantUrl),
    ...(content.article ? [articleUrl(content.article)] : []),
  ];
  const origin = SITE_URL.replace(/\/+$/, '');
  return urls.every((u) => {
    try {
      const parsed = new URL(u);
      return (
        parsed.protocol === 'https:' &&
        u.startsWith(`${origin}/`) &&
        // reject trailing-empty segments from a blank slug/id
        !/\/(events|restaurants|articles)\/$/.test(parsed.pathname)
      );
    } catch {
      return false;
    }
  });
}

/**
 * -1 means "could not read", which the pre-send gate below treats as a failure
 * exactly like zero. Returning 0 for an unreadable count happened to land on
 * the safe side of that gate, but it also told the PREVIEW that the newsletter
 * has no subscribers - a number an operator reads and believes.
 */
async function activeSubscriberCount(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('newsletter_subscribers')
    .select('email', { count: 'exact', head: true })
    .eq('status', 'active');
  if (error) {
    console.error('[assemble-weekly-digest] subscriber count failed:', error.message);
    return -1;
  }
  return count ?? 0;
}

/** Assemble the rendered digest (no DB writes). Shared by preview + assemble. */
async function assembleDigest(supabase: SupabaseClient): Promise<{
  content: DigestContent;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}> {
  const content = await gatherContent(supabase);
  const subject = buildSubject(content);
  // Generic recipient: the dispatch path sends one body_html to all
  // recipients, so the unsubscribe link is the token-less preferences page
  // (identical to the manual send_now path).
  const rendered = renderEmail({
    bodyHtml: buildBodyHtml(content),
    bodyText: buildBodyText(content),
    recipient: { email: 'subscriber@desmoinesinsider.com' },
    category: 'marketing',
  });
  return { content, subject, bodyHtml: rendered.html, bodyText: rendered.text };
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(url, serviceKey);

  const body = await req.json().catch(() => ({}));
  const action: string = body.action ?? 'assemble';

  // --- preview: assemble only, no campaign row, no jobRunner ----------------
  if (action === 'preview') {
    try {
      const { content, subject, bodyHtml } = await assembleDigest(supabase);
      const recipients = await activeSubscriberCount(supabase);
      return new Response(
        JSON.stringify({
          ok: true,
          subject,
          body_html: bodyHtml,
          recipient_count: recipients,
          counts: {
            events: content.events.length,
            restaurants: content.restaurants.length,
            article: content.article ? 1 : 0,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[assemble-weekly-digest] preview error:', message);
      return new Response(JSON.stringify({ ok: false, error: 'Failed to build preview' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // --- assemble: full pipeline, jobRunner-wrapped ---------------------------
  const job = await runJob('assemble-weekly-digest', async (ctx) => {
    // 1) pause flag
    const { data: flag } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('flag_key', PAUSE_FLAG)
      .maybeSingle();
    if (flag && flag.enabled === false) {
      ctx.meta({ paused: true });
      return { paused: true };
    }

    // 2) idempotency — already created a digest this week?
    const since = new Date(Date.now() - DEDUPE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('newsletter_campaigns')
      .select('id, created_at')
      .eq('campaign_type', 'weekly_digest')
      .gte('created_at', since)
      .limit(1);
    if (recent && recent.length > 0) {
      ctx.meta({ skipped: 'already_created_this_week' });
      return { skipped: true, existing: recent[0].id };
    }

    // 3) assemble
    const { content, subject, bodyHtml } = await assembleDigest(supabase);
    const totalItems =
      content.events.length + content.restaurants.length + (content.article ? 1 : 0);

    // 4) pre-send validation gates — any failure throws (aborts + alerts).
    const recipientCount = await activeSubscriberCount(supabase);
    const gateFailures: string[] = [];
    if (recipientCount < 0) gateFailures.push('subscriber count could not be read');
    else if (recipientCount === 0) gateFailures.push('no active subscribers');
    if (totalItems <= 0) gateFailures.push('no content to send (events/restaurants/article all empty)');
    if (subject.length === 0 || subject.length > SUBJECT_MAX) {
      gateFailures.push(`subject length ${subject.length} outside 1..${SUBJECT_MAX}`);
    }
    if (!linksResolve(content)) gateFailures.push('one or more content links are malformed');
    if (gateFailures.length > 0) {
      ctx.meta({ aborted: true, gateFailures, recipientCount, totalItems });
      throw new Error(`weekly digest aborted: ${gateFailures.join('; ')}`);
    }

    // 5) schedule via the existing dispatch path (status='scheduled', due now).
    const { data: campaign, error: insertError } = await supabase
      .from('newsletter_campaigns')
      .insert({
        subject,
        preheader: 'Your weekly roundup of Des Moines events, restaurants, and stories.',
        body_html: bodyHtml,
        segment: {},
        status: 'scheduled',
        scheduled_for: new Date().toISOString(),
        recipient_count: recipientCount,
        campaign_type: 'weekly_digest',
      })
      .select('id')
      .single();
    if (insertError || !campaign) {
      throw new Error(`failed to create digest campaign: ${insertError?.message ?? 'unknown'}`);
    }

    ctx.processed(1);
    ctx.meta({
      campaignId: campaign.id,
      subject,
      recipientCount,
      events: content.events.length,
      restaurants: content.restaurants.length,
      article: content.article ? 1 : 0,
    });
    return {
      scheduled: true,
      campaignId: campaign.id,
      recipientCount,
      items: totalItems,
    };
  });

  return new Response(
    JSON.stringify({ success: job.ok, status: job.status, ...job.result }),
    { status: job.ok ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
