# Automation Jobs — pg_cron Inventory

**Last updated:** 2026-06-12 (WEB-AUTO-001)

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
| **`dedupe-content-weekly`** | `15 3 * * 1` | fn `dedupe-content` | **Detect duplicate events/restaurants (trigram + proximity); auto-merge >=0.9, queue 0.7-0.9 to Admin → Content → Duplicates (WEB-AUTO-005)** | ✅ |
| **`ai-article-pipeline-daily`** | `0 11 * * *` | fn `ai-article-pipeline` | **Daily local-SEO article: pick topic → generate draft → score → publish (≥80) / draft-review (50-79) / discard (<50). Cap 1 auto-publish/day. Pause via `feature_flags.ai_article_pipeline_enabled` (WEB-AUTO-007)** | ✅ |
| **`job-health-watchdog-daily`** | `0 8 * * *` | fn `job-health-watchdog` | **Alert on missed/failed observed jobs (WEB-AUTO-001)** | n/a |

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
Set `ADMIN_ALERT_EMAIL` (or `ALERT_EMAIL`) + `RESEND_API_KEY` for alerts.

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
   through the **identical Resend path**, so unsubscribe/compliance handling and
   delivery webhooks (opens/bounces/complaints) behave exactly as for a manual send.

Send results (delivered/failed per campaign) are recorded by
`dispatch-scheduled-newsletters` through the jobRunner and show in **Admin → Job
Health**; both jobs are re-runnable there.

**Admin controls** (Admin → Email → Campaigns → *Weekly digest*): a one-click
toggle pauses/resumes the recurrence (writes `weekly_digest_enabled`), and
**Preview next week's digest** renders the assembled subject + HTML (and content /
recipient counts) without creating or sending anything.
