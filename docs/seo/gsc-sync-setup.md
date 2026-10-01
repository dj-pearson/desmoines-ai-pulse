# Search Console sync: setup and owner steps

Project: Des Moines Insider (desmoinesinsider.com), Supabase project `wtkhfqpmcegzcbngroui`.
Written for SEO-050, 2026-10-01.

## Where it stands

The sync is running. Nothing in this section needs doing; it is here so the next person checks the same things.

| Piece | State on 2026-10-01 | How it was checked |
|---|---|---|
| `gsc-oauth`, `gsc-fetch-properties`, `gsc-sync-data` | Deployed: v2, v27, v30, all `verify_jwt=true`, updated 2026-09-30 | Management API `GET /v1/projects/{ref}/functions`; an anon POST returns 401/400, not the 404 of an unknown name |
| Deploy workflow | `deploy-edge-functions.yml` has succeeded on every push to `main` since at least 2026-09-20 | `gh run list --workflow=deploy-edge-functions.yml` |
| `SUPABASE_ACCESS_TOKEN` | Set as a **repository** secret. The job runs in the `Scrape` environment, which does not define it, so the repo-level value is what it gets | `gh secret list` and `gh secret list --env Scrape` (names only) |
| Function secrets | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SITE_URL` all set | Management API secrets list, names only |
| Schedule | pg_cron `gsc-sync-daily`, `15 10 * * *` (10:15 UTC), from `20260831000001_gsc_sync_cron.sql`. Re-pulls the trailing 28 days ending three days ago | `cron.job`, `cron.job_run_details` |
| Last run | 2026-10-01 10:15 UTC, HTTP 200, 10,723 keyword rows and 3,161 page rows for 2026-08-31..2026-09-28 | `net._http_response` |
| OAuth grant | 1 linked credential, active, has a refresh token, refreshed 2026-10-01 10:15 UTC | `gsc_oauth_credentials` (presence and timestamps only) |
| Data | `gsc_keyword_performance` 24,015 rows, 2025-09-03..2026-09-28; `gsc_page_performance` 18,598 rows, 2025-09-02..2026-09-28 | row counts |

The 2026-09-30 refresh-token deadline from WEB-SEO-014 did not bite. Google revokes a refresh token after six months **unused**, and the daily job has used it every morning since 2026-08-31. If the job stops, the new deadline is six months after the last successful run.

Why 28 days and not 3: Search Console revises recent days for a while after first reporting them, and a 28-day re-pull means a run that fails for a week loses nothing. The job is an upsert, so overlap costs nothing but time (about 7 seconds).

## Owner steps

### 1. Ship the SEO-050 function changes (before anyone reconnects)

The `gsc-oauth` that is live today deletes the property row on reconnect. `gsc_keyword_performance` and `gsc_page_performance` reference `gsc_properties` with `ON DELETE CASCADE`, and all five credential rows belong to one admin, so that admin reconnecting through the current function would delete about 42,600 rows of history. Search Console only retains 16 months, so the oldest of it could not be re-fetched.

This branch fixes that, and does not need anything beyond the normal flow:

- Merge through `develop` and a `release/x.y.z` branch to `main`. `deploy-edge-functions.yml` deploys the changed functions on the push to `main`.
- Or, to deploy just these three from `main` without waiting:

  ```bash
  gh workflow run deploy-edge-functions.yml --ref main \
    -f functions="gsc-oauth gsc-fetch-properties gsc-sync-data"
  ```

  The equivalent by hand, with `SUPABASE_ACCESS_TOKEN` in the environment:

  ```bash
  for fn in gsc-oauth gsc-fetch-properties gsc-sync-data; do
    supabase functions deploy "$fn" --project-ref wtkhfqpmcegzcbngroui
  done
  ```

No `config.toml` entry is needed. All three stay `verify_jwt = true`: the cron job sends the service-role key, the admin dashboard sends the admin's session JWT, and both are valid Supabase JWTs.

What changes for callers, all admin-only, no mobile binary calls any of them:

- `gsc-oauth` now requires an admin JWT (or the API key / service-role key). Both web callers already send the admin session. It no longer logs the inserted credential row, which put the access and refresh tokens into the function logs.
- `gsc-sync-data` and `gsc-fetch-properties` use the shared CORS and rate-limit middleware (20 requests per 15 minutes per IP; the cron job is exempt) and validate input. A non-UUID id or a `dateRange` outside 1-540 is a 400. The widest range ever sent was 480.
- `gsc-sync-data` records a failed token refresh on the property, deactivates the credential on `invalid_grant`, clears a stale `error_message` after a clean run, and writes `last_used_at`. The response gains `summary.batchErrors`.

### 2. Nothing to apply in the database

`20261018000050_gsc_export_performance.sql` was applied to production on 2026-10-01 and is ledgered in `supabase_migrations.schema_migrations`. It only creates `gsc_export_performance`.

### 3. If the grant lapses: reconnect

The admin SEO page (`/admin/seo`, Search Console Performance) says **Search Console is not connected** when the linked credential is missing or deactivated, and **The last sync failed** for any other recorded error. Not connected needs a person:

1. Deploy step 1 first if it has not shipped. Do not reconnect through the old `gsc-oauth`.
2. Sign in to https://desmoinesinsider.com as an admin and open `/admin/analytics-dashboard`, **Search Traffic** tab.
3. Do **not** press **Disconnect**. It deletes the property row, and every synced row goes with it.
4. On the Google Search Console card press **Connect**. This calls `gsc-oauth?action=authorize` and sends you to Google's consent screen.
5. Sign in with the Google account that owns `sc-domain:desmoinesinsider.com` in Search Console and approve read-only Search Console access (`webmasters.readonly`). The request uses `access_type=offline` and `prompt=consent`, so Google issues a new refresh token every time.
6. Google redirects to the URL in the `GOOGLE_REDIRECT_URI` function secret, which must be `https://desmoinesinsider.com/admin/oauth/callback` and must be listed as an authorized redirect URI on the OAuth client in Google Cloud project 941186988265. A `redirect_uri_mismatch` error on this step means those two disagree.
7. The callback page exchanges the code, saves the new credential, re-points the existing property at it and deactivates the old credentials, then calls `gsc-fetch-properties`. The property row, and its history, survive.
8. Press **Sync Data**, or wait for 10:15 UTC. The panel's Last sync tile should show today.

If Google answers 403 `accessNotConfigured`, the Search Console API has been disabled in project 941186988265; enable it under APIs and Services.

### 4. Check it is still running

```sql
select last_sync_at, next_sync_at, status, error_message from gsc_properties;
select status, start_time from cron.job_run_details d join cron.job j using (jobid)
 where j.jobname = 'gsc-sync-daily' order by start_time desc limit 3;
select max(date) from gsc_page_performance;   -- should be within 3-4 days of today
```

pg_cron records **succeeded** when the HTTP request is queued, not when the sync lands, so `last_sync_at` and `max(date)` are the real signals.

## Fallback: load a manual export

When the sync cannot run, export from Search Console (Performance, Search results, Export, Download CSV), unzip it into `Keyword/` in the main checkout (gitignored), and load it:

```bash
npx tsx scripts/import-gsc-export.ts desmoinesinsider.com-Performance-on-Search-2026-09-30 --dry-run
npx tsx scripts/import-gsc-export.ts desmoinesinsider.com-Performance-on-Search-2026-09-30
```

It writes `Queries.csv` and `Pages.csv` into `gsc_export_performance`, keyed by property, dimension, search type and the date range read from `Chart.csv`. Re-running the same export is a no-op; `--replace` updates values in place. Nothing is deleted. It refuses an export filtered by query, page, country or device, because that would be a subset dressed as totals.

These rows are range aggregates, which is why they are not in the daily tables: at least nine readers sum those across dates, and a 92-day aggregate written onto one date would inflate all of them.

Loaded on 2026-10-01:

| Export | Range | Queries | Pages |
|---|---|---|---|
| `...-2026-09-30` | 2026-06-29..2026-09-28 (92 days) | 1,000 rows, 425 clicks, 53,403 impressions | 992 rows, 1,040 clicks, 110,141 impressions |

The 2026-08-28 export (16 months, 2025-07-26..2026-08-26) is in `Keyword/` and has not been loaded; the same command takes it.

## Open: the daily page table undercounts

For the same 92 days, `gsc_page_performance` sums to 425 clicks and about 68,000 impressions. The export's `Pages.csv` says 1,040 clicks and 110,141 impressions, and its `Chart.csv` daily totals agree with `Pages.csv`. The daily table matches the export's **query** total (425 clicks) instead, the number that loses anonymized queries, and holds about 110 pages a day against 992 in the export.

So the API pull in `gsc-sync-data` (`dimensions: ["page", "date", "device"]`, `rowLimit: 25000`, well under the limit at about 3,200 rows per run) is losing roughly 60% of clicks and 40% of impressions that the UI attributes to pages. Not diagnosed. The next step is one run of the page request with `["page"]` only, and one with `["page", "date"]`, over the same window, compared with `Pages.csv`. Until then, read page-level totals from the export table and treat the daily table as a trend line, not as totals.
