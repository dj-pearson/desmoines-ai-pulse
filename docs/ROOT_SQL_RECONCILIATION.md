# Root SQL Reconciliation (WEB-DB-006)

For most of the project's early life, ad-hoc `*.sql` files accumulated in the
repository **root** (not `supabase/migrations/`). They were run by hand in the
Supabase SQL Editor and never entered the tracked migration ledger. This
document records the disposition of all **34** such files.

- Schema changes that were genuinely un-tracked were reconciled into a single
  idempotent migration: **`supabase/migrations/20260711000003_reconcile_root_sql_schema.sql`**.
- Everything already present in the ledger is marked **superseded**.
- Pure debug/diagnostic scripts and legacy cron plumbing (now managed by tracked
  cron migrations) are marked **removed** with no ledger impact.

All 34 root files were deleted after this reconciliation. `supabase/check_images.sql`
and everything under `supabase/migrations/` were left untouched (except adding the
one new migration above).

## Bucket summary

| Bucket | Meaning | Count |
|---|---|---|
| A | Schema DDL / schema-domain data changes | 9 |
| B | Cron / pg_cron / http-extension setup & schedule fixes | 15 |
| C | Debug / diagnostic / verify / read-only inspection scripts | 10 |
| **Total** | | **34** |

## Disposition table

| # | File | Bucket | Disposition | Rationale |
|---|------|:---:|---|---|
| 1 | `add-restaurant-city-column.sql` | A | superseded-by-`20250100000000_baseline_tables.sql` | `restaurants.city` already exists in baseline; the location→city backfill UPDATEs are an obsolete one-off data fix. |
| 2 | `add_opening_timeframe.sql` | A | captured-in-new-migration | Adds `restaurants.opening_timeframe` + partial index; not in any tracked migration. |
| 3 | `add_opening_timeframe_to_openings.sql` | A | captured-in-new-migration | Adds `opening_timeframe` to `restaurants` and (guarded) `restaurant_openings`; not tracked. |
| 4 | `add_opening_timeframe_to_restaurants.sql` | A | captured-in-new-migration | Duplicate of #2/#3 (`opening_timeframe` on `restaurants` + `restaurant_openings`); folded into the single reconcile migration. |
| 5 | `cleanup_duplicate_column.sql` | A | obsolete-removed (destructive, excluded) | `DROP COLUMN restaurants.opening` is a destructive change; deliberately NOT captured to honor the Backward-Compatibility deprecation flow. |
| 6 | `complete_restaurants_migration.sql` | A | partially-superseded / captured-in-new-migration | `opening_date` + `status` already in `20250728165446_add_opening_column_to_restaurants.sql`; its `opening_timeframe` is captured in the reconcile migration. |
| 7 | `fix_status_values.sql` | A | obsolete-removed | Data-only normalization of `status`; the CHECK constraint on `restaurants.status` already guarantees valid values, so it is a no-op. |
| 8 | `manual_migration.sql` | A | partially-superseded / captured-in-new-migration | `opening_date` + `status` already tracked (`20250728165446…`); its `source_url` column is captured in the reconcile migration. |
| 9 | `manual_migration_ai_writeup.sql` | A | superseded-by-`20250730120000_add_ai_writeup_fields.sql` | `ai_writeup` / `writeup_generated_at` / `writeup_prompt_used` on `events` + `restaurants` are already tracked. |
| 10 | `deploy-cron-system.sql` | B | superseded-by-tracked-cron-migrations | Legacy pg_cron + `cron_logs` setup; `cron_logs`/`scraping_jobs` and cron scheduling are tracked (`20251123000000_setup_cron_scraping.sql`, `20260710000000_repoint_agent_crons_to_runner.sql`). |
| 11 | `enhanced-cron-auto-update.sql` | B | superseded-by-tracked-cron-migrations | Legacy schedule auto-update logic, replaced by the tracked cron runner. |
| 12 | `final-cron-fix.sql` | B | superseded-by-tracked-cron-migrations | One-off `scraping_jobs` schedule fix; superseded. |
| 13 | `fix-all-cron-jobs.sql` | B | superseded-by-tracked-cron-migrations | One-off `scraping_jobs` schedule repair; superseded. |
| 14 | `fix-cron-scheduling.sql` | B | superseded-by-tracked-cron-migrations | One-off schedule repair; superseded. |
| 15 | `fix-http-extension.sql` | B | superseded-by-tracked-cron-migrations | http/pg_net extension + cron plumbing; managed by tracked migrations. |
| 16 | `immediate-fix-schedules.sql` | B | superseded-by-tracked-cron-migrations | Immediate `next_run` recompute; superseded. |
| 17 | `implement-simple-cron.sql` | B | superseded-by-tracked-cron-migrations | Alternate simple cron implementation; superseded. |
| 18 | `improved-cron-system.sql` | B | superseded-by-tracked-cron-migrations | Iterative cron system rewrite; superseded. |
| 19 | `proper-schedule-fix.sql` | B | superseded-by-tracked-cron-migrations | Schedule recompute fix; superseded. |
| 20 | `safe-function-replacement.sql` | B | superseded-by-tracked-cron-migrations | `CREATE OR REPLACE` of cron trigger function; superseded by tracked function definitions. |
| 21 | `simple-cron-no-http.sql` | B | superseded-by-tracked-cron-migrations | http-free cron variant; superseded. |
| 22 | `simple-schedule-fix.sql` | B | superseded-by-tracked-cron-migrations | Minimal schedule fix; superseded. |
| 23 | `update-schedules.sql` | B | superseded-by-tracked-cron-migrations | Bulk `scraping_jobs` schedule update; superseded. |
| 24 | `direct-table-update.sql` | B | superseded-by-tracked-cron-migrations | Data-only `scraping_jobs` `next_run`/`last_run` recompute (no DDL); superseded by the tracked cron runner. |
| 25 | `check_restaurants_table.sql` | C | obsolete-debug-script-removed | Read-only `SELECT` inspection of the restaurants table. |
| 26 | `debug-catch-6am.sql` | C | obsolete-debug-script-removed | Debug script for the 6AM schedule; SELECT-heavy with a one-off schedule UPDATE, superseded by tracked cron. |
| 27 | `debug-catch-schedule.sql` | C | obsolete-debug-script-removed | Schedule-debugging inspection script; superseded by tracked cron. |
| 28 | `debug-schedule-saves.sql` | C | obsolete-debug-script-removed | Debug script for schedule persistence; superseded by tracked cron. |
| 29 | `debug_restaurants_table.sql` | C | obsolete-debug-script-removed | Read-only diagnostic of restaurants columns/data. |
| 30 | `diagnostic-and-force-fix.sql` | C | obsolete-debug-script-removed | Diagnostic + one-off force schedule fix; superseded by tracked cron. |
| 31 | `find_highland_underground.sql` | C | obsolete-debug-script-removed | Read-only lookup for a specific record ("Highland Underground"). |
| 32 | `test_highland_underground.sql` | C | obsolete-debug-script-removed | Read-only test query for a specific record. |
| 33 | `verify-cron-function.sql` | C | obsolete-debug-script-removed | Cron function verification harness; superseded by tracked cron migrations. |
| 34 | `verify-cron-system.sql` | C | obsolete-debug-script-removed | Read-only verification of cron job state; superseded by tracked cron migrations. |

## New migration contents

`supabase/migrations/20260711000003_reconcile_root_sql_schema.sql` captures only
the additive, un-tracked schema changes, written to be idempotent:

1. `ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS opening_timeframe TEXT`
   (+ comment + partial index `idx_restaurants_opening_timeframe`).
2. `ALTER TABLE public.restaurant_openings ADD COLUMN IF NOT EXISTS opening_timeframe TEXT`
   inside a guarded `DO` block that only runs if the table exists.
3. `ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS source_url TEXT` (+ comment).

No destructive statements. Running it against a database that already has these
shapes is a no-op.
