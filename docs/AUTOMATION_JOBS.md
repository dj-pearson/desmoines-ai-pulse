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
| `cleanup-old-events-weekly` | weekly | fn `cleanup-old-events` | Purge events past retention + their media | ✅ |
| `monthly-event-purge` | monthly | fn `cleanup-old-events` | Monthly deep purge | ✅ (same fn) |
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
