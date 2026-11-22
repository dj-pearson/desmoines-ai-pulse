# Automation Jobs — pg_cron Inventory

**Last updated:** 2026-11-21 (WEB-AUTO-019 - restaurant verification jobs)

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
| **`event-lifecycle-cleanup`** | `15 4 * * *` | fn `cleanup-old-events` | **Two-phase stale-event lifecycle: soft-hide 30d past date, archive + hard-delete 180d past (WEB-AUTO-006)** | ✅ |
| ~~`cleanup-old-events-weekly`~~ | retired | SQL `cleanup_old_events()` | Replaced by `event-lifecycle-cleanup` (legacy single-phase hard delete; full-row archive broke on the wider events schema) | — |
| `monthly-event-purge` | monthly | fn `cleanup-old-events` | Monthly deep purge (same fn) | ✅ (same fn) |
| `validate-source-urls-weekly` | weekly | fn `validate-source-urls` | Detect + auto-repair broken event URLs (re-discover, Wayback, flag) | ✅ |
| `update-trending-scores` | `15 * * * *` | SQL / fn | Recompute trending scores | — |
| `generate-weekend-guide` | scheduled | fn `generate-weekend-guide` | Build the weekend guide | — |
| `generate-recurring-event-instances` | `0 8 * * *` | SQL | Materialize recurring event instances | — |
| `send-event-reminders-hourly` | `0 * * * *` | fn `send-event-reminders` | Email event reminders | — |
| `process-event-reminders-direct` | `0 * * * *` | SQL/fn | Direct reminder processing | — |
| `send-weekly-digest` | `0 8 * * *` | fn `send-weekly-digest` | Weekly digest email | — |
| **`assemble-weekly-digest`** | `0 14 * * 2` | fn `assemble-weekly-digest` | **Auto-assemble + schedule the weekly digest (top events / restaurants / newest article); validation-gated. Pause via `feature_flags.weekly_digest_enabled` (WEB-AUTO-008)** | ✅ |
| `dispatch-scheduled-newsletters` | `* * * * *` | fn `dispatch-scheduled-newsletters` | Send due scheduled campaigns (now jobRunner-wrapped — logs a run only when a batch is actually dispatched) | ✅ |
| `aggregate-daily-ad-analytics` | `0 1 * * *` | SQL fn | Roll up ad analytics for the day | planned |
| `cleanup-security-logs` | `0 2 * * *` | SQL fn | Trim old security logs | — |
| `cleanup-login-attempts` | (on demand) | SQL fn | Remove login_attempts > 24h (WEB-SEC-006) | — |
| `daily-social-media-automation` / `social-media-automation-hourly` / `social-media-generation` / `social-media-publishing` | `0/15/30 * * * *` | fn `social-media-manager` | Generate + publish social posts | planned |
| `auto-trigger-scraping-jobs` / `scraping-jobs-runner` | `*/10-15 * * * *` | SQL/fn | Drive the scraping-jobs queue | — |
| **`data-quality-heal-nightly`** | `30 2 * * *` | fn `data-quality-heal` | **Geocode + SEO/GEO + image self-heal, <=25 rows/table/run (WEB-AUTO-003)** | ✅ |
| **`backfill-images-events`** | `7 * * * *` | fn `backfill-images` | **Drain the imageless-events backlog, ≤25 rows/run. Prioritizes never-checked rows (`image_checked_at NULLS FIRST`) and stamps `image_checked_at` on every attempt so permanent failures (e.g. SeatGeek JS shells) drop out for a 7-day retry window instead of re-scraping every run (WEB-AUTO-018)** | — |
| **`backfill-images-restaurants`** | `23 */6 * * *` | fn `backfill-images` | **Same imageless-backlog drain for restaurants (source page: `website`) (WEB-AUTO-018)** | — |
| **`restaurant-hours-refresh`** | `41 9 * * *` | fn `bulk-update-restaurants` (`hoursOnly`, `staleDays` 30, `batchSize` 25) | **Re-read hours and businessStatus for every restaurant with a place id whose last Google check is over 30 days old or missing; a Places 404 queues a closure review (WEB-FEAT-079, WEB-BE-064). Job name `bulk-update-restaurants-hours`** | yes |
| **`restaurant-place-lookup`** | `13 10 * * *` | fn `bulk-update-restaurants` (`placeLookup`, `batchSize` 25) | **Text Search by name and address for restaurants with no place id; stores the id only on a confident match, queues the rest (WEB-BE-064)** | yes |
| **`restaurant-verification-health`** | `7 11 * * *` | fn `restaurant-verification-health` | **Counts verified / unverified-over-45-days / never-checked restaurants and closure reviews open over 14 days; alerts when unverified exceeds `system_settings.restaurant_verification_health.max_unverified_share` (default 25%) or the social poster skipped restaurants 3 runs running. Numbers shown on Admin, Closure reviews (WEB-AUTO-019)** | yes |
| **`restaurant-openings-advance`** | `47 10 * * *` | SQL `advance_restaurant_openings()` | **newly_opened -> open 60 days after newly_opened_at (or opening_date); queues announced/opening_soon rows more than 7 days past their opening_date that Google does not confirm as `opening_unconfirmed` closure reviews. The announced -> newly_opened move itself is a trigger on the Places refresh write (WEB-BE-073)** | - |
| **`business-claims-health`** | `23 13 * * *` | fn `business-claims-health` | **Counts pending business claims and alerts the admin when any has waited more than 3 days; the count is also on the admin home and in executive-digest. Migration 20261121000090 (WEB-ADS-047)** | yes |
| **`subscription-reconcile`** | `23 10 * * *` | fn `subscription-reconcile` (`batchSize` 50) | **Re-reads from Stripe up to 50 web subscriptions still marked active/trialing/past_due after their period end and writes Stripe's answer when it differs, one `subscription_events` row (`reconciled`) per correction. A Stripe error, 404 or unreadable answer writes nothing (entitlement already ends 3 days after the period). iOS/Android rows are counted, not re-validated yet. Corrected count on Admin, Job health. Migration 20261122000020 (WEB-BE-062)** | yes |
| **`backfill-images-attractions`** | `43 */6 * * *` | fn `backfill-images` | **Same imageless-backlog drain for attractions (source page: `website`) (WEB-AUTO-018)** | — |
| **`menu-refresh-weekly`** | `19 * * * 2` | fn `scrape-restaurant-menus` (`scheduled: true`) | **Re-scrape current menus older than 30 days on `menu_scrape_enabled` restaurants (rows with no menu yet are eligible too). Hourly slices on Tuesdays because one request finishes only one or two restaurants inside 150s; at most 25 restaurants attempted per week, counted from this job's `items_processed` over 6 days. A restaurant tried in the last 6 days is not retried. A failed or empty scrape publishes nothing, so the previous menu stays current; the failure is in `menu_scrape_attempts` and the slice's `items_failed`. Migration 20261121000060 (WEB-BE-071)** | ✅ |
| **`dedupe-content-weekly`** | `15 3 * * 1` | fn `dedupe-content` | **Detect duplicate events/restaurants (trigram + proximity); auto-merge >=0.9, queue 0.7-0.9 to Admin → Content → Duplicates (WEB-AUTO-005)** | ✅ |
| **`ai-article-pipeline-daily`** | `0 11 * * *` | fn `ai-article-pipeline` | **Daily local-SEO article: pick topic → generate draft → score → publish (≥80) / draft-review (50-79) / discard (<50). Cap 1 auto-publish/day. Pause via `feature_flags.ai_article_pipeline_enabled` (WEB-AUTO-007)** | ✅ |
| **`moderate-content-sweep`** | `*/15 * * * *` | fn `moderate-content` | **Re-moderate reviews stuck in `pending` (fail-open safety net for the inline review path); ≤25/run. Pause via `feature_flags.content_moderation_enabled` (WEB-AUTO-009)** | ✅ |
| **`job-health-watchdog-daily`** | `0 8 * * *` | fn `job-health-watchdog` | **Alert on missed/failed observed jobs (WEB-AUTO-001)** | n/a |
| **`agent-escalation-router`** | `*/10 * * * *` | fn `agent-escalation-router` | **Route tier-2/3 agent_tasks to the owner queue (agent_registry.owner_role) and coalesce duplicates; fail-open per task (AOS-CORE-005)** | ✅ |
| **`approval-sweeper`** | `*/15 * * * *` | fn `agent-approvals` (mode=sweep) | **Expire stale pending action approvals and re-escalate them as human tasks (AOS-CORE-007)** | ✅ |
| **`ops-digest-daily`** | `0 13 * * *` | fn `agent-ops-digest` | **Daily batched digest to ops: tier-1 auto-resolutions, open-task counts, overdue, and agent failures (AOS-CORE-010)** | ✅ |

\* **Observed** = wrapped with `jobRunner` and recording to `automation_job_runs`.
`✅` done, `planned` = adopts the same one-line wrap as its WEB-AUTO story lands
(WEB-AUTO-003 data-quality, -004 URL repair, -008 newsletter, -011 sitemaps, -012
social). `—` = not yet observed.

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
Set `ADMIN_ALERT_EMAIL` (or `ALERT_EMAIL`) + the `AWS_SES_*` secrets for alerts.

## Recovery / manual re-run

Each job can be re-run from **Admin → Job Health** (manual trigger), or by
invoking its edge function directly with the `EDGE_FUNCTION_API_KEY` /
service-role key. `automation_job_runs` retains history for auditing.

### Reversing a merge (WEB-AUTO-005)

Every merge (auto or manual) writes an immutable `content_merges` row and the
loser row is **retained** (only flagged `is_merged = true`, never deleted). Within
**30 days** a merge can be reversed by calling `unmerge_content(<merge_id>)`
(admin or service role): the loser row is restored (`is_merged = false`) and
reappears in listings. Repointed child rows (favorites, reviews, …) stay with the
survivor — they were genuine duplicates — so reversal un-hides the duplicate
listing for re-evaluation rather than perfectly reconstructing the pre-merge state.
Ambiguous pairs queue in **Admin → Content → Duplicates** for one-click merge/dismiss.

### Stale-event lifecycle & recovery (WEB-AUTO-006)

`cleanup-old-events` runs nightly in two phases:

1. **Soft-hide** — events `> 30 days` past their `date` get `is_hidden = true`
   (+ `hidden_at`). All public list/detail queries and the sitemaps exclude
   `is_hidden`, so these silently drop out of the site while staying in the DB.
   (Most public surfaces already only show future events, so this mainly affects
   any past event still being surfaced.)
2. **Archive + hard-delete** — events `> 180 days` past their `date` are first
   snapshotted into `event_archive` (`id, title, source_url, date, location,
   venue, category, archived_at`), their Storage images removed, then the event
   and its child rows are deleted. The 180-day window gives a long recovery
   period before anything is destroyed.

Run counts (`hidden` / `archived` / `deleted`) flow through the jobRunner and
show in the **Admin → Job Health** "Event Lifecycle" card.

**Recovering a soft-hidden event** (within the 180-day window, before it is
purged): call `unhide_stale_event('<event_id>')` as an admin/service role. It
sets `is_hidden = false` and the event reappears everywhere immediately. Note it
deliberately **leaves `hidden_at` set** — that's what stops the nightly job from
re-hiding the restored row. Once an event passes the 180-day delete window it is
purged regardless of `is_hidden`; restore it before then.

## AI article pipeline (WEB-AUTO-007)

`ai-article-pipeline` runs daily and writes one local-SEO article without a human
in the loop:

1. **Topic** — calls `suggest-article-topics`, ranks by SEO potential, and picks
   the top suggestion whose title isn't a near-duplicate of a recent article.
2. **Draft** — calls `generate-article` with that topic (creates a `draft`).
3. **Score** — word count (≥400), Des Moines/Iowa relevance, readability,
   similarity-to-existing, and a Claude content-safety check → `quality_score` 0-100.
4. **Route** —
   - **≥ 80 and safe** → `status = published`, `published_at` set, `is_auto_published = true`
     (enters the public site, sitemap, and newsletter content pool automatically);
   - **50-79** → kept as a `draft` with `review_status = pending_review` for the
     admin review queue;
   - **< 50, too short, too similar, or unsafe** → the draft is **discarded**
     (deleted), with the attempt + reasons recorded in `automation_job_runs`.

Cap: **1 auto-published article/day**. Score distribution + decision flow through
the jobRunner and show in **Admin → Job Health** (re-runnable there too).
Auto-published articles are tagged with an **"AI Auto"** badge in the Articles
manager.

**Pausing the pipeline** (no code change): set the `ai_article_pipeline_enabled`
row in `feature_flags` to `enabled = false`. The next run exits early and records
`paused: true`. Re-enable to resume. Human-authored article flows are unaffected.

## Weekly digest newsletter (WEB-AUTO-008)

`assemble-weekly-digest` runs every **Tuesday 14:00 UTC** (~9:00 AM Central) and
writes + schedules the weekly digest with no human in the loop:

1. **Pause check** — `feature_flags.weekly_digest_enabled`. When `false`, the run
   exits early and records `paused: true`.
2. **Idempotency** — skips if a `weekly_digest` campaign was already created in the
   last 6 days, so a duplicate cron firing or a manual re-run is a no-op.
3. **Assemble** — top upcoming events (next 7 days, not hidden/merged), top-rated
   restaurants, and the newest published article, wrapped in the shared CAN-SPAM
   marketing email layout (`_shared/emailLayout.ts`).
4. **Pre-send validation gates** — recipient segment > 0 active subscribers,
   subject within the 120-char cap, at least one content item, and every content
   link a well-formed `https` URL under the site origin. **Any gate failure aborts
   the run** (no campaign row created) and surfaces as a terminal `jobRunner`
   failure that **alerts the admin** — a broken email is never scheduled.
5. **Schedule** — inserts a `newsletter_campaigns` row (`status = 'scheduled'`,
   `scheduled_for = now()`, `campaign_type = 'weekly_digest'`). The existing
   `dispatch-scheduled-newsletters` cron (every minute) sends it within ~1 minute
   through the **identical SES path**, so unsubscribe/compliance handling and
   delivery events (deliveries/bounces/complaints via `ses-events`) behave exactly
   as for a manual send.

Send results (delivered/failed per campaign) are recorded by
`dispatch-scheduled-newsletters` through the jobRunner and show in **Admin → Job
Health**; both jobs are re-runnable there.

**Admin controls** (Admin → Email → Campaigns → *Weekly digest*): a one-click
toggle pauses/resumes the recurrence (writes `weekly_digest_enabled`), and
**Preview next week's digest** renders the assembled subject + HTML (and content /
recipient counts) without creating or sending anything.

## UGC auto-moderation (WEB-AUTO-009)

`moderate-content` scores user-generated content (reviews in `user_ratings`,
contact/feedback in `contact_submissions`) for toxicity / spam / off-topic with
Claude, and writes one `content_moderation` row per item (scores + verdict +
admin override). Each content table carries a `moderation_status` visibility gate.

**Verdict bands:** toxicity ≥ 0.7 **or** spam ≥ 0.6 → `rejected` (hidden); toxicity
0.5-0.7 / spam 0.4-0.6 / off-topic ≥ 0.7 → `flagged` (hidden, queued); otherwise
→ `approved` (visible). A failed AI call → `error`: the row stays **hidden-pending**
and is surfaced for an admin (fail-open with flag — content is never lost or
auto-published unmoderated).

**Write-path wiring:**
- **Reviews** are inserted with `moderation_status = 'pending'` (hidden) and the
  web client invokes `moderate-content` inline with the author's JWT, so the
  author gets an immediate, polite verdict. A bare star rating (no review text)
  is inserted `approved`.
- **Contact submissions** (usually anonymous, so they can't call the auth-gated
  function from the browser) are enqueued **server-side** by an `AFTER INSERT`
  trigger (`enqueue_contact_moderation`) via `pg_net` with the service-role
  bearer — no anonymous caller ever reaches Claude. Contact intake is admin-only,
  so rows are **not** held pending; moderation only demotes spam (sets
  `moderation_status = 'rejected'` **and** `status = 'spam'` so the FeedbackInbox
  spam filter catches it).

**Sweep / recovery:** `moderate-content-sweep` (every 15 min, ≤25/run) re-moderates
any review left in `pending` (e.g. the inline call failed). Counts flow through the
jobRunner; the job is re-runnable from **Admin → Job Health** (which sends
`manual: true` → a sweep).

**Admin queue** (Admin → Content → *Moderation*): every flagged / rejected /
pending / error item with its scores + reasons + excerpt, with one-click
**Approve & publish** or **Keep hidden**. Decisions call the `decide_moderation`
RPC (admin/service only), which updates the queue row (recording `decided_by`) and
the content table's `moderation_status` atomically.

**Pausing** (no code change): set `feature_flags.content_moderation_enabled` to
`enabled = false`. While paused, moderation **trusts everything through** —
pending content is force-approved (so nothing gets stuck hidden) rather than
scored. Re-enable to resume.
