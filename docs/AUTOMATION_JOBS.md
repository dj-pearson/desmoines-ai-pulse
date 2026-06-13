# Automation Jobs — pg_cron Inventory

**Last updated:** 2026-06-13 (WEB-AUTO-006)

Every scheduled job (pg_cron → edge function or SQL) is listed here. Jobs wrapped
with `_shared/jobRunner.ts` record each run in `automation_job_runs` and surface
in **Admin → Job Health**; the `job-health-watchdog` (daily 08:00 UTC) emails the
admin when an observed job misses ~2 expected runs or its latest run fails.

All times UTC. Schedules are cron expressions (`min hour dom mon dow`).

| Job (cron name) | Schedule | Target | What it does | Observed* |
|---|---|---|---|---|
| `scrape-events-morning` | `0 6 * * *` | fn `scrape-events` | Scrape events from partner sources | — |
| `scrape-events-evening` | `0 18 * * *` | fn `scrape-events` | Scrape events (evening pass) | — |
| `enhance-events-morning` | `30 6 * * *` | fn `batch-enhance-events` | AI-enhance new event descriptions | — |
| `enhance-events-evening` | `30 18 * * *` | fn `batch-enhance-events` | AI-enhance (evening) | — |
| `auto-enrich-restaurants-daily` | `0 3 * * *` | fn `auto-enrich-restaurants` | Fill missing restaurant data | — |
| `backfill-coordinates-nightly` | `30 4 * * *` | fn `backfill-all-coordinates` | Geocode rows missing lat/lng | — |
| `nightly-coordinate-backfill` | `0 2 * * *` | fn `backfill-all-coordinates` | Geocode backfill (2nd pass) | — |
| **`event-lifecycle-nightly`** | `0 4 * * *` | fn `cleanup-old-events` | **Two-phase stale-event lifecycle: soft-hide @30d, archive-snapshot + hard-delete @6mo (WEB-AUTO-006)** | ✅ |
| ~~`cleanup-old-events-weekly`~~ | retired | — | Legacy hard-delete-at-90d (no observability) — **unscheduled by 20260612000012**, replaced by `event-lifecycle-nightly` | — |
| `monthly-event-purge` | monthly | fn `cleanup-old-events` | Monthly deep purge (same fn, now two-phase) | ✅ (same fn) |
| `validate-source-urls-weekly` | weekly | fn `validate-source-urls` | Detect + auto-repair broken event URLs (re-discover, Wayback, flag) | ✅ |
| `update-trending-scores` | `15 * * * *` | SQL / fn | Recompute trending scores | — |
| `generate-weekend-guide` | scheduled | fn `generate-weekend-guide` | Build the weekend guide | — |
| `generate-recurring-event-instances` | `0 8 * * *` | SQL | Materialize recurring event instances | — |
| `send-event-reminders-hourly` | `0 * * * *` | fn `send-event-reminders` | Email event reminders | — |
| `process-event-reminders-direct` | `0 * * * *` | SQL/fn | Direct reminder processing | — |
| `send-weekly-digest` | `0 8 * * *` | fn `send-weekly-digest` | Weekly digest email | — |
| `dispatch-scheduled-newsletters` | `* * * * *` | fn `dispatch-scheduled-newsletters` | Send due scheduled campaigns | planned |
| `aggregate-daily-ad-analytics` | `0 1 * * *` | SQL fn | Roll up ad analytics for the day | planned |
| `cleanup-security-logs` | `0 2 * * *` | SQL fn | Trim old security logs | — |
| `cleanup-login-attempts` | (on demand) | SQL fn | Remove login_attempts > 24h (WEB-SEC-006) | — |
| `daily-social-media-automation` / `social-media-automation-hourly` / `social-media-generation` / `social-media-publishing` | `0/15/30 * * * *` | fn `social-media-manager` | Generate + publish social posts | planned |
| `auto-trigger-scraping-jobs` / `scraping-jobs-runner` | `*/10-15 * * * *` | SQL/fn | Drive the scraping-jobs queue | — |
| **`data-quality-heal-nightly`** | `30 2 * * *` | fn `data-quality-heal` | **Geocode + SEO/GEO + image self-heal, <=25 rows/table/run (WEB-AUTO-003)** | ✅ |
| **`job-health-watchdog-daily`** | `0 8 * * *` | fn `job-health-watchdog` | **Alert on missed/failed observed jobs (WEB-AUTO-001)** | n/a |
| **`dedupe-content-weekly`** | `15 3 * * 1` | fn `dedupe-content` | **Detect duplicate events/restaurants (trigram + proximity); auto-merge >=90%, queue 70–90% (WEB-AUTO-005)** | ✅ |
| **`auto-article-pipeline-daily`** | `0 13 * * *` | fn `auto-article-pipeline` | **AI article pipeline: topic → draft → quality gate → auto-publish (WEB-AUTO-007)** | ✅ |
| **`weekly-digest-assemble`** | `0 15 * * 2` | fn `assemble-weekly-digest` | **Auto-assemble the weekly digest (events + restaurants + newest article), gate, and queue it for the existing dispatcher (WEB-AUTO-008)** | ✅ |
| **`moderate-content-sweep`** | `15 * * * *` | fn `moderate-content` | **Safety-net: re-moderate any review/contact row stuck `pending` (real-time call failed); cheap when none (WEB-AUTO-009)** | ✅ |
| **`campaign-creative-review-sweep`** | `35 * * * *` | fn `review-campaign-creative` | **Safety-net: auto-review ad creatives not yet reviewed (real-time call failed); spec/quality/brand-safety/standing checks → auto-approve or hold (WEB-AUTO-010)** | ✅ |
| **`sitemap-regen-6h`** | `0 */6 * * *` | fn `generate-sitemaps` | **Event-driven sitemap regen: drains `sitemap_change_queue`, regenerates events/restaurants/attractions/articles sitemaps to the `sitemaps` Storage bucket (served fresh by the Pages middleware), pings search engines (WEB-AUTO-011)** | ✅ |

\* **Observed** = wrapped with `jobRunner` and recording to `automation_job_runs`.
`✅` done, `planned` = adopts the same one-line wrap as its WEB-AUTO story lands
(WEB-AUTO-003 data-quality, -004 URL repair, -008 newsletter, -012 social).
`—` = not yet observed.

## How to observe a job

Wrap the work in `runJob` (`supabase/functions/_shared/jobRunner.ts`):

```ts
import { runJob } from '../_shared/jobRunner.ts';

const job = await runJob('my-job-name', async (ctx) => {
  // ...do work...
  ctx.processed(n);          // items processed
  ctx.failed(m);             // items failed (=> status 'partial')
  ctx.meta({ foo: 'bar' });  // extra metadata
  return summary;            // available as job.result
});
// job.ok / job.status / job.error
```

`runJob` records start/finish, retries transient failures (2x, exponential
backoff), writes the final status, and emails the admin on terminal failure.
Set `ADMIN_ALERT_EMAIL` (or `ALERT_EMAIL`) + `RESEND_API_KEY` for alerts.

## Recovery / manual re-run

Each job can be re-run from **Admin → Job Health** (manual trigger), or by
invoking its edge function directly with the `EDGE_FUNCTION_API_KEY` /
service-role key. `automation_job_runs` retains history for auditing.

## Duplicate merge — review & reversal (WEB-AUTO-005)

The weekly `dedupe-content` job finds near-duplicate events/restaurants via
pg_trgm name similarity + haversine proximity (and same-date for events):

- **>= 90% name match** with matching date/proximity → **auto-merged**. The
  richer row is kept; every child FK (favorites, reviews, sponsored links, …) is
  repointed to it generically; the loser is marked `is_merged = true` (RETAINED,
  not deleted) so browse hooks (`useEvents`/`useRestaurants` + the
  `get_rotated_restaurants` RPC) hide it.
- **70–90%** (and same-name restaurants within 400m) → queued to
  `content_merge_candidates`, surfaced under **Admin → Content → Duplicates**
  with side-by-side cards and one-click Merge / Swap-which-to-keep / Not-a-duplicate.
- Same-name restaurants with no coordinates or > 400m apart are skipped
  (franchise guard) — never auto-merged, never queued.

Every merge (auto or manual) writes an immutable `content_merges` audit row.
**Reversal:** call `unmerge_content(merge_id)` within **30 days** to restore the
loser row's visibility. (Child rows already repointed to the survivor stay with
the survivor — moving them back is not auto-reversed.)

## Stale-event lifecycle — soft-hide, archive, recovery (WEB-AUTO-006)

`cleanup-old-events` (cron `event-lifecycle-nightly`, daily 04:00 UTC) is the
**primary** path; it replaced the legacy `cleanup-old-events-weekly` SQL cron,
which hard-deleted at 90 days with no observability or recovery window (the SQL
function `cleanup_old_events` still exists but is no longer scheduled). Two phases:

1. **Soft-hide** (default **30 days** after the event date): rows are flagged
   `is_hidden = true` + `hidden_at`. This is **recoverable** and **non-destructive**.
   Public list/detail queries (`useEvents`, SEO landing pages, `MonthlyEventsPage`)
   and all three sitemap generators exclude `is_hidden = true`. The flag defaults
   to `false`, so existing web/mobile readers are unaffected (CLAUDE.md-safe additive).
2. **Archive + hard-delete** (default **6 months** / ~180 days): a lightweight
   snapshot (id, title, source_url, category, location, venue, date + full row
   jsonb) is written to `event_archive_snapshots` **before** any destructive step,
   then Storage images + `media_assets` are removed and the row + related data are
   purged via `purge_old_events`. Snapshots are upserted on `event_id` (idempotent).

Hidden/archived/deleted counts flow through the `jobRunner` into `automation_job_runs`
and render as a **Stale-Event Lifecycle** card in **Admin → Job Health**.

**Recovery within the hide window** (before the 6-month delete) fully restores an
event — just clear the flag:

```sql
UPDATE public.events SET is_hidden = false, hidden_at = NULL WHERE id = '<event_id>';
```

It immediately reappears in browse/detail/sitemaps (no other state was changed).
After hard-delete only the `event_archive_snapshots` record remains (recreate from
the stored `snapshot` jsonb if needed).

**Tuning:** invoke `cleanup-old-events` with `{ "hideAfterDays": N, "retentionMonths": M }`
to override windows, or `{ "dryRun": true }` to preview `wouldHide` / `wouldDelete`
counts without changing anything.

## AI article pipeline (WEB-AUTO-007)

`auto-article-pipeline` (cron `auto-article-pipeline-daily`, daily 13:00 UTC) writes
fresh local-SEO articles with zero manual touches:

1. **Topic** — Claude suggests 6 locally-relevant topics; the pipeline drops any
   that duplicate a recent article slug or score ≥0.7 Jaccard against the last 100
   titles, then picks the highest `seo_potential`.
2. **Draft** — Claude generates a full markdown article with Des Moines local
   context (same strategy as the manual `generate-article`, which is left untouched
   for human-authored flows).
3. **Quality gate** (0–100 + reasons): word count ≥400, Des Moines/Iowa relevance,
   title similarity-to-existing, readability (words/sentence), SEO completeness, plus
   a Claude **safety check**.
4. **Decision**: `≥80` → **published** (`status=published`, `published_at`, slug auto-
   generated, `review_status=approved`); `50–79` → **draft** in the review queue
   (`review_status=pending_review`); `<50` or unsafe → **discarded** (attempt logged,
   no row written). The safety check **fails safe** — if it can't complete, the draft
   is held, never auto-published.

**Daily cap:** at most **1 auto-published article/day**; a high-scoring draft created
after the cap is reached is queued as a draft instead.

**Pause without code changes:** flip the single `system_settings` row
(`setting_type='article_pipeline'`) — toggle it from **Admin → Articles → Pause AI
Pipeline**, or via SQL:

```sql
UPDATE public.system_settings
SET settings = '{"paused": true}'::jsonb
WHERE setting_type = 'article_pipeline';
```

Published articles automatically enter the sitemap (`generate-sitemap` selects
`status='published'`) and the published-article pool the newsletter draws from.
Auto-generated rows show an **AI {score}** badge in the Admin → Articles table; run
metrics + the score/decision distribution flow through `jobRunner` into
`automation_job_runs` (re-runnable from **Admin → Job Health**).

## Auto-assembled weekly digest (WEB-AUTO-008)

`assemble-weekly-digest` (cron `weekly-digest-assemble`, Tuesdays 15:00 UTC ≈
9–10am Central) writes and queues the weekly newsletter with zero manual touches:

1. **Pause check** — reads `system_settings` (`setting_type='weekly_digest'`); if
   `paused`, the run exits clean without queuing.
2. **De-dupe** — at most one auto digest per 6 days (a `newsletter_campaigns` row
   with `campaign_type='weekly_digest'` created in the window), so a double cron
   firing or a manual re-run can't send two.
3. **Assemble** — top upcoming events (next 7 days, hidden/merged excluded),
   trending restaurants (featured then highest-rated), and the newest published
   article. Internal links are built from existing DB rows (event slug replicates
   `createEventSlugWithCentralTime`, restaurant/article use their `slug`), so they
   resolve by construction.
4. **Pre-send gates** — recipient segment resolves to **> 0** active subscribers,
   **at least one event** is present, every link carries a non-empty slug, and the
   generated subject is under the **120-char** cap. **Any hard gate failure aborts
   the send (no campaign created) and the `jobRunner` raises an admin alert** — a
   broken/empty digest never goes out.
5. **Queue** — a `status='scheduled'` `newsletter_campaigns` row (`scheduled_for=now`,
   segment = all active subscribers) is inserted, so the existing
   `dispatch-scheduled-newsletters` worker (runs every minute) sends it. Unsubscribe,
   CAN-SPAM footer, delivery tracking, and bounce/complaint webhooks are therefore
   **identical to a human-composed campaign**.

**Preview** next week's digest anytime from **Admin → Newsletter campaigns →
Automated weekly digest → Preview next** (calls the function with
`{action:'preview'}` — assembles + runs gates, renders the email, sends nothing).

**Pause without code changes:** **Admin → Newsletter campaigns → Pause**, or via SQL:

```sql
UPDATE public.system_settings
SET settings = '{"paused": true}'::jsonb
WHERE setting_type = 'weekly_digest';
```

Assembly/queue metrics (recipient count, content counts, subject, gate outcome)
flow through `jobRunner` into `automation_job_runs` (re-runnable from **Admin → Job
Health**). The actual send result (delivered/failed/opens/bounces) lands on the
queued `newsletter_campaigns` row and is visible in the **Newsletter campaigns**
table.

## Content auto-moderation (WEB-AUTO-009)

`moderate-content` AI-moderates user-generated content — reviews (`user_ratings`)
and contact/feedback (`contact_submissions`) — so the clean majority publishes
instantly and only genuine judgment calls reach a human.

**Real-time (primary path):** the write hooks (`useRatings.submitRating`,
`useContactForm.submitContactForm`) insert the row `moderation_status='pending'`
(hidden) and fire `moderate-content { contentType, id }` fire-and-forget. A Claude
prompt scores toxicity / spam / off-topic 0.0–1.0:

- `toxicity ≥ 0.7` or `spam ≥ 0.6` → **rejected** (stored + hidden, kept for audit; a
  rejected contact is also marked `status='spam'`).
- `toxicity ≥ 0.5` or `spam ≥ 0.45` → **flagged** (hidden + queued for a human).
- otherwise → **approved** (visible immediately). A review with no text is approved
  without an AI call.

**Fail-open with flag:** if the AI call errors the row stays `pending` (hidden,
never auto-published) and is retried by the hourly sweep; after 3 attempts it is
flagged for a human. The single-call path is **not** admin-gated (triggering
moderation can only hide/flag, never publish) but is rate-limited (30/min/IP) and
idempotent (re-calls on a decided row are no-ops).

**Safety-net sweep:** cron `moderate-content-sweep` (hourly at :15) calls
`{action:'sweep'}`, which re-moderates up to 25 pending rows per table — catching
anything whose real-time call failed. Wrapped in `jobRunner` (counts of
approved/rejected/flagged/pending in `automation_job_runs`; re-runnable from
**Admin → Job Health**).

**Review queue:** **Admin → Content → Moderation** lists flagged/rejected items with
scores + reasons and one-click **Approve** / **Reject** (calls
`{action:'decision'}`, which is admin-gated and writes a `security_audit_logs` row).

**Display:** the web review list shows only `moderation_status='approved'` rows (the
author always sees their own, even while pending). RLS is intentionally NOT tightened
— live iOS/Android binaries read `user_ratings`, so visibility is filtered
client-side rather than via a policy that would hide reviews from older clients.

## Campaign creative auto-review (WEB-AUTO-010)

`review-campaign-creative` reviews advertiser ad creatives automatically so a clean
creative is approved in seconds instead of waiting for the next admin login; only
creatives a check couldn't clear reach a human.

**Real-time (primary path):** `CreativeUploadForm` inserts the creative
(`is_approved=false`) and fires `review-campaign-creative { creativeId }`
fire-and-forget. The function runs four checks:

1. **good_standing** — the owning campaign is in a payable/live state (not
   cancelled / rejected / refunded).
2. **image** — the image loads (https, 2xx, image content-type) and its stored
   dimensions match an allowed size for the placement (`sponsored_listing` needs no
   image — it uses the listing's own).
3. **url** — the target link is https, resolves (HEAD→GET, redirects followed) and
   never lands on a disallowed scheme/private host (SSRF guard).
4. **brand_safety** — Claude scores the title/description/CTA for unsafe / low-quality
   ad copy.

**Decision:** all checks pass → `is_approved=true` (the same field a human admin sets;
the campaign then follows its normal status flow — `active` if the start date has
arrived, else `pending_review`). Any hard failure → the creative **stays pending** with
machine-readable reasons in `auto_review_reasons` / `auto_review_checks`, shown in the
**Admin → Campaigns → (campaign) → Creative Review** pending list. **Fail-safe:** if the
brand-safety AI can't run, the creative is **never** auto-approved — it's left pending
and retried by the sweep; after 3 attempts it is held for a human.

The single-call path is authorized for the **owning advertiser, an admin, or
service/API key**, rate-limited (20/min/user), and idempotent (`auto_reviewed_at` is the
marker — re-calls on a reviewed/approved creative are no-ops).

**Safety-net sweep:** cron `campaign-creative-review-sweep` (hourly at :35) calls
`{action:'sweep'}`, which auto-reviews up to 25 not-yet-reviewed creatives — catching
anything whose real-time call failed and draining the manual backlog. Wrapped in
`jobRunner` (approved/failed/retry counts + `autoApprovalRate` in `automation_job_runs`;
re-runnable from **Admin → Job Health**). Every terminal auto-decision writes a
`security_audit_logs` row (`event_type='creative_auto_review'`).

**Admin override** is unchanged — the admin Approve/Reject buttons still work in both
directions (`useAdminCampaigns.approveCreative` / `rejectCreative`). Serving is
unaffected: an auto-approved creative is byte-for-byte identical to a human-approved
one, so `get_active_ads` (read by iOS) behaves exactly as before.

## Event-driven sitemap regeneration (WEB-AUTO-011)

Sitemaps used to refresh only at `npm run build` (deploy) — new/edited content could
wait a day (or a deploy) to become indexable. `generate-sitemaps` (cron
`sitemap-regen-6h`, every 6 hours) is now the **primary, no-deploy path**; build-time
generation (`scripts/generate-dynamic-sitemaps.ts`, run by `npm run build`) remains as
the **fallback**.

**How it flows:**

1. **Enqueue** — AFTER INSERT/UPDATE/DELETE triggers on `events`, `restaurants`,
   `attractions`, and `articles` insert a row into `sitemap_change_queue`
   (`enqueue_sitemap_change()`, SECURITY DEFINER, never blocks the underlying write).
2. **Regenerate** — every 6h the job snapshots the unprocessed queue (to report which
   content types changed), regenerates the events / restaurants / attractions / articles
   sitemaps + the index, and **uploads them to the public `sitemaps` Storage bucket**
   (`upsert`). Hidden (`is_hidden`) / merged (`is_merged`) / past events and
   non-`published` articles are excluded automatically — so WEB-AUTO-006 stale events
   drop out on the same cycle. Event URLs use the Central-time slug
   (`title-YYYY-MM-DD`) so they resolve in `EventDetails`.
3. **Serve fresh** — the Cloudflare Pages middleware (`functions/_middleware.ts`) serves
   `/sitemap.xml`, `/sitemap-events.xml`, `/sitemap-restaurants.xml`,
   `/sitemap-attractions.xml`, `/sitemap-articles.xml` from the Storage bucket; on ANY
   error it falls back to the build-time static file in `dist/`. Other sitemap files
   (`sitemap-static` / `-playgrounds` / `-guides`) stay build-time-generated and are
   served statically (the index references them).
4. **Ping** — after a successful write the job pings Google + Bing
   (`/ping?sitemap=…`, best-effort, status logged). Google deprecated its
   unauthenticated ping endpoint in 2023, so this is only a nudge — Google Search
   Console / Bing Webmaster Tools remain the authoritative submission path.
5. **Observe** — wrapped in `jobRunner` (`generated` counts, `storageWritten`, `ping`
   statuses, `affectedTypes`, `queueProcessed` in `automation_job_runs`; re-runnable
   from **Admin → Job Health**). If no file is written to Storage the run fails
   terminally so the watchdog alerts (the static fallback still serves, but the
   event-driven path needs attention).

**Pause:** flip the `system_settings` row `setting_type='sitemap_regen'`
(`{"paused": true}`) — the job then skips regeneration (the static files keep serving).
No code change / deploy required.

**Backward compat:** the JSON response keeps the shape `SEOTools.tsx` reads
(`success`, `generated.{main_urls,events_urls,restaurants_urls,total_urls}`,
`sitemaps.main`); new keys are additive. The bucket, table, triggers, pause flag, and
cron are all additive (migration `20260612000017`). The function is auth-gated with
`requireAdminOrApiKey` (admin JWT for the UI / Job Health re-run, the service-role
bearer for cron); it is not called by any mobile binary.
