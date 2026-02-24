# Scripts Directory

This folder contains all utility scripts for the **Des Moines Insider** project, organized into two categories: [Automation / AI](#automation--ai-ralph) and [Data & Maintenance](#data--maintenance-scripts).

---

## Table of Contents

- [Environment Setup](#environment-setup)
- [Automation / AI — Ralph](#automation--ai-ralph)
  - [ralph.mjs](#ralphmjs)
  - [CLAUDE.md](#claudemd)
  - [prd.json / prd.json.example](#prdjson--prdjsonexample)
  - [progress.txt](#progresstxt)
- [Data & Maintenance Scripts](#data--maintenance-scripts)
  - [Event Management](#event-management)
  - [Database Utilities](#database-utilities)
  - [SEO & Sitemaps](#seo--sitemaps)
  - [Image Optimization](#image-optimization)
  - [Stripe / Payments](#stripe--payments)
  - [Diagnostic / One-Off Scripts](#diagnostic--one-off-scripts)

---

## Environment Setup

Most scripts require environment variables. Copy `.env.example` to `.env` at the project root and fill in the values before running any script.

| Variable | Required By | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Most scripts | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Most scripts | Supabase anonymous (public) key |
| `SUPABASE_SERVICE_KEY` | `backfill-coordinates.ts` | Supabase service role key (admin) |
| `SUPABASE_URL` | `run-migration.ts` | Supabase project URL (alt name) |
| `SUPABASE_SERVICE_ROLE_KEY` | `run-migration.ts` | Supabase service role key |
| `STRIPE_SECRET_KEY` | `setup-stripe-products.js` | Stripe secret key (`sk_test_...` or `sk_live_...`) |

> **Never hardcode credentials.** All secrets must be in `.env` or set as environment variables.

---

## Automation / AI — Ralph

Ralph is an **autonomous AI coding agent loop** that reads a Product Requirements Document (`prd.json`), picks the next unfinished user story, implements it using an AI tool (Claude or Amp), runs quality checks, commits the changes, and then loops to the next story — all without human intervention.

### `ralph/ralph.mjs`

**What it is:** The main orchestrator script for Ralph. Pure Node.js — no WSL, no extra shell windows required. Works on Windows, macOS, and Linux.

**What it does:**
1. Reads `prd.json` (from the project root, or `scripts/ralph/prd.json` as fallback)
2. Counts remaining stories and displays a summary
3. Archives the previous `progress.txt` run if not resuming
4. Loops up to `--max` iterations (default: 10), each time spawning the AI tool with `CLAUDE.md` as the system prompt
5. Passes `--print` / `--no-conversation` flags to run Claude in non-interactive mode
6. Streams output directly to the terminal so you can watch progress live

**How to run:**

```bash
# Standard run (up to 10 iterations with Claude)
node scripts/ralph/ralph.mjs --tool claude

# Or via the npm shortcut
npm run ralph

# Run up to 20 iterations
node scripts/ralph/ralph.mjs --tool claude --max 20

# Resume a previous run (keeps existing progress.txt archive)
node scripts/ralph/ralph.mjs --tool claude --resume
npm run ralph:resume

# Use Amp instead of Claude
node scripts/ralph/ralph.mjs --tool amp
npm run ralph:amp
```

**Prerequisites:**
```bash
npm install -g @anthropic-ai/claude-code   # for --tool claude
# OR
npm install -g @sourcegraph/amp            # for --tool amp
```

**Options:**

| Flag | Default | Description |
|---|---|---|
| `--tool <name>` | `claude` | AI tool to use: `claude` or `amp` |
| `--max <n>` | `10` | Maximum number of iterations to run |
| `--resume` | `false` | Skip archiving — continue from the last run |

---

### `ralph/CLAUDE.md`

**What it is:** The system prompt / instructions file that Ralph passes to Claude (or Amp) at the start of every iteration.

**What it does:** Instructs the AI agent to:
- Read `prd.json` and `progress.txt`
- Check out or create the correct branch
- Implement a single user story (highest priority with `passes: false`)
- Run quality checks (`npm run type-check && npm run lint`)
- Update `CLAUDE.md` files if reusable patterns are discovered
- Commit with a conventional message: `feat: [ID] - [Title]`
- Update `prd.json` to mark the story `passes: true`
- Append structured learnings to `progress.txt`

> Editing this file changes how Ralph behaves across all future runs.

---

### `ralph/prd.json` / `ralph/prd.json.example`

**What it is:** The Product Requirements Document that drives Ralph.

**What it does:** Defines the project, target branch, and a list of user stories. Ralph processes them in priority order, marking each `passes: true` when done.

**File location priority:**
1. `prd.json` at the **project root** (preferred)
2. `scripts/ralph/prd.json` (fallback)

**Format (`prd.json.example`):**
```json
{
  "project": "Des Moines Insider",
  "branchName": "ralph/feature-name",
  "description": "Brief description of this PRD",
  "userStories": [
    {
      "id": "US-001",
      "title": "Story title",
      "description": "As a user, I want...",
      "acceptanceCriteria": [
        "Criteria 1",
        "Criteria 2"
      ],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}
```

**To create a new PRD:**
1. Copy `scripts/ralph/prd.json.example` to the project root as `prd.json`
2. Fill in your stories
3. Run `npm run ralph`

---

### `ralph/progress.txt`

**What it is:** Ralph's running memory and progress log across all iterations.

**What it does:** Each iteration appends a structured entry containing what was implemented, which files changed, and — critically — **learnings for future iterations** (patterns, gotchas, useful context). The top of the file contains a `## Codebase Patterns` section that consolidates the most important reusable knowledge.

> Do not delete this file between runs unless you want Ralph to start fresh.

---

## Data & Maintenance Scripts

All scripts in this section require a Node.js environment with `tsx` installed for TypeScript files:

```bash
npm install -g tsx
```

### Event Management

---

#### `event-datetime-crawler.ts`

**What it is:** The primary event date/time crawler. Uses Puppeteer to visit event source URLs and extract accurate date and time information.

**What it does:** Queries events from Supabase, visits each `source_url` with a headless browser, extracts the correct date/time (handling CDT/CST timezone conversion), and either reports what it found (dry run) or updates the database.

**How to run:**
```bash
# Dry run — shows what would be updated
tsx scripts/event-datetime-crawler.ts

# Apply changes to the database
tsx scripts/event-datetime-crawler.ts --apply

# npm shortcuts
npm run crawl-events           # dry run
npm run crawl-events:apply     # apply changes
```

---

#### `fix-event-times.js`

**What it is:** A simple Node.js wrapper that calls `event-datetime-crawler.ts` with a friendly CLI.

**What it does:** Passes `--apply`, `--event-id`, and `--limit` flags through to the underlying crawler. Useful for targeted fixes on specific events.

**How to run:**
```bash
# Dry run
node scripts/fix-event-times.js

# Apply all changes
node scripts/fix-event-times.js --apply

# Fix a single event
node scripts/fix-event-times.js --apply --event-id <uuid>

# Limit to first N events
node scripts/fix-event-times.js --apply --limit 10
```

---

#### `convert-timezones.ts`

**What it is:** Bulk timezone conversion script for events stored with incorrect UTC offsets.

**What it does:** Fetches all events, identifies those stored at midnight UTC (a sign of incorrect timezone handling), converts them from US/Central to proper UTC, and updates the database.

**How to run:**
```bash
# Dry run — logs what would change
tsx scripts/convert-timezones.ts

# Apply timezone corrections
tsx scripts/convert-timezones.ts --apply

# npm shortcuts
npm run convert-timezones          # dry run
npm run convert-timezones:apply    # apply changes
```

---

#### `analyze-event-dates.ts`

**What it is:** A read-only diagnostic tool for event date quality.

**What it does:** Queries all events and outputs a breakdown of date patterns — how many are at midnight UTC, how many have times, date distribution by month, etc. No database writes.

**How to run:**
```bash
tsx scripts/analyze-event-dates.ts
```

---

#### `analyze-event-urls.ts`

**What it is:** A read-only audit of event source URLs in the database.

**What it does:** Groups events by their source domain (Eventbrite, CatchDesMoines, etc.), identifies broken or missing URLs, and outputs a summary report. No database writes.

**How to run:**
```bash
tsx scripts/analyze-event-urls.ts
```

---

#### `find-platform-events.ts`

**What it is:** A targeted search script for events from specific platforms.

**What it does:** Queries the database for events from known platforms (Eventbrite, First Fleet Concerts, Des Moines Performing Arts, Iowa Cubs, etc.) using URL pattern matching. Useful for auditing platform-specific imports.

**How to run:**
```bash
tsx scripts/find-platform-events.ts
```

---

#### `enhanced-datetime-extraction.ts`

**What it is:** An enhanced date/time extraction library written for Deno/Supabase Edge Functions.

**What it does:** Contains timezone-aware date and time extraction functions (`extractDateTimeWithTimezone`) designed to handle CDT/CST properly for Des Moines events. Intended to be integrated into the main scraper Edge Function, not run standalone.

> This is a Deno script. It imports from `deno.land` and is not meant to be run with Node.js.

---

#### `event-datetime-sql-generator.ts`

**What it is:** A Puppeteer-based crawler that generates SQL UPDATE statements for event dates rather than applying them directly.

**What it does:** Visits event source URLs, extracts corrected date/time values, and writes `UPDATE` statements to a `.sql` file. This lets you review the SQL before applying it to the database manually.

> **Note:** This file contains hardcoded credentials and should be updated to use environment variables before use in production.

**How to run:**
```bash
tsx scripts/event-datetime-sql-generator.ts
# Output: a generated .sql file in the project root
```

---

#### `timezone-conversion.sql`

**What it is:** A standalone SQL script for bulk timezone correction.

**What it does:** Runs `UPDATE` statements in Supabase/PostgreSQL to convert event dates from US/Central to UTC using the `AT TIME ZONE` operator. Apply via the Supabase SQL Editor or `psql`.

**How to run:**
```sql
-- Paste into Supabase SQL Editor or run via psql
\i scripts/timezone-conversion.sql
```

---

### Database Utilities

---

#### `run-migration.ts`

**What it is:** A Node.js script for running SQL migration files against the Supabase database.

**What it does:** Reads all `.sql` files from `supabase/migrations/`, optionally filters to a specific file, and executes them against the database using the Supabase service role key. Useful for applying migrations without the Supabase CLI.

**Requires:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars.

**How to run:**
```bash
# Run all pending migrations
tsx scripts/run-migration.ts

# Run a specific migration file
tsx scripts/run-migration.ts 20240101_my_migration.sql

# npm shortcut
npm run migrate
```

---

#### `backfill-coordinates.ts`

**What it is:** A backfill script for lat/lng coordinates on existing records.

**What it does:** Queries `events`, `restaurants`, and `attractions` rows where `latitude` is null, geocodes their `location` field, and updates the coordinates. Uses the Supabase service role key (admin access required).

**Requires:** `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_KEY` env vars.

**How to run:**
```bash
tsx scripts/backfill-coordinates.ts
```

---

#### `test-direct-update.ts`

**What it is:** A one-off test/diagnostic script for verifying direct Supabase UPDATE operations.

**What it does:** Attempts to update a specific hardcoded event record's date field and verifies the write succeeds. Used to debug Supabase RLS (Row Level Security) or connectivity issues.

> Intended for development/debugging only. The target event ID is hardcoded.

**How to run:**
```bash
tsx scripts/test-direct-update.ts
```

---

### SEO & Sitemaps

---

#### `generate-dynamic-sitemaps.ts`

**What it is:** A dynamic sitemap generator that pulls live data from Supabase.

**What it does:** Queries events, restaurants, and attractions from the database and generates a full `sitemap.xml` with `<url>` entries for every content page. Writes the file to `public/sitemap.xml`.

> **Note:** This file contains a hardcoded Supabase key and should be updated to use environment variables.

**How to run:**
```bash
tsx scripts/generate-dynamic-sitemaps.ts
# Output: public/sitemap.xml
```

---

#### `generate-sitemap.js`

**What it is:** A simple static sitemap generator for known routes.

**What it does:** Generates a basic `sitemap.xml` from a hardcoded list of static pages (home, events, about, contact). Does not query the database. Writes output to `public/sitemap.xml`.

**How to run:**
```bash
node scripts/generate-sitemap.js
# Output: public/sitemap.xml
```

> For production use, prefer `generate-dynamic-sitemaps.ts` which includes all content pages.

---

### Image Optimization

---

#### `optimize-images.mjs`

**What it is:** An image optimization script using the `sharp` library.

**What it does:** Processes PNG images in the `public/` directory, resizes them to a maximum width, reduces quality, and generates WebP versions alongside the originals. Significantly improves page load performance.

**Requires:** `sharp` package — install with `npm install sharp`.

**How to run:**
```bash
node scripts/optimize-images.mjs
# npm shortcut
npm run optimize-images  # (if configured)
```

---

### Stripe / Payments

---

#### `setup-stripe-products.js`

**What it is:** A Stripe product and pricing setup script.

**What it does:** Creates the required Stripe products and price objects for the Free, Insider, and VIP subscription tiers. Supports dry-run mode to preview what would be created before making live API calls.

**Requires:** `STRIPE_SECRET_KEY` env var (`sk_test_...` for test, `sk_live_...` for production).

**How to run:**
```bash
# Dry run — preview without making API calls
node scripts/setup-stripe-products.js --dry-run

# Create products in test mode
node scripts/setup-stripe-products.js

# Create products in live mode
node scripts/setup-stripe-products.js --live
```

---

#### `setup-stripe-products.ps1`

**What it is:** PowerShell equivalent of `setup-stripe-products.js` for Windows environments.

**What it does:** Same functionality as the `.js` version but implemented as a PowerShell script for environments where Node.js is not preferred.

**How to run:**
```powershell
# From PowerShell
.\scripts\setup-stripe-products.ps1
```

---

#### `complete-stripe-setup.sql`

**What it is:** SQL script to initialize Stripe-related database tables and records.

**What it does:** Creates or populates subscription plan records, product ID mappings, and price ID fields in the Supabase database to match what was created in Stripe. Run after `setup-stripe-products.js`.

**How to run:**
```sql
-- Paste into Supabase SQL Editor or run via psql
\i scripts/complete-stripe-setup.sql
```

---

#### `update-stripe-price-ids.sql`

**What it is:** A targeted SQL patch for updating Stripe price IDs in the database.

**What it does:** Updates specific subscription plan records with the correct `stripe_price_id` values after a Stripe product setup or migration. Edit the IDs in the file before running.

**How to run:**
```sql
-- Edit price IDs in the file first, then:
\i scripts/update-stripe-price-ids.sql
```

---

### Diagnostic / One-Off Scripts

These scripts were written for specific investigations and are kept for reference.

---

#### `check-catchdesmoines-urls.ts`

**What it is:** A URL validity checker for CatchDesMoines.com event links.

**What it does:** Queries events sourced from CatchDesMoines and checks whether their `source_url` values return valid HTTP responses. Logs broken or redirected URLs.

**How to run:**
```bash
tsx scripts/check-catchdesmoines-urls.ts
```

---

#### `check-harbour-update.ts`

**What it is:** A targeted diagnostic for Harbour event records.

**What it does:** Fetches Harbour-related events from Supabase and verifies their data is up to date. Originally used to investigate a specific event update issue.

**How to run:**
```bash
tsx scripts/check-harbour-update.ts
```

---

#### `find-wine-event.ts`

**What it is:** A search script for a specific recurring event (Iowa Wine and Cider Festival).

**What it does:** Queries the database for any event matching "wine" in the title or from known wine festival URLs. Used to verify scraper results for this specific event.

**How to run:**
```bash
tsx scripts/find-wine-event.ts
```

---

#### `test-eventbrite-extraction.ts`

**What it is:** A single-URL test for Eventbrite page scraping.

**What it does:** Opens a specific Eventbrite event URL with Puppeteer and attempts to extract the date, time, title, and description using multiple CSS selector strategies. Used to validate and debug the Eventbrite scraping logic.

**How to run:**
```bash
tsx scripts/test-eventbrite-extraction.ts
```

---

## Quick Reference

| Script | npm shortcut | Env vars needed |
|---|---|---|
| `ralph/ralph.mjs` | `npm run ralph` | none (uses Claude CLI) |
| `event-datetime-crawler.ts` | `npm run crawl-events` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `fix-event-times.js` | — | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `convert-timezones.ts` | `npm run convert-timezones` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `analyze-event-dates.ts` | — | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `analyze-event-urls.ts` | — | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `find-platform-events.ts` | — | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `run-migration.ts` | `npm run migrate` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `backfill-coordinates.ts` | — | `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |
| `generate-dynamic-sitemaps.ts` | — | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `generate-sitemap.js` | — | none |
| `optimize-images.mjs` | — | none |
| `setup-stripe-products.js` | — | `STRIPE_SECRET_KEY` |
| `setup-stripe-products.ps1` | — | `STRIPE_SECRET_KEY` |
