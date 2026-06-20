# Image Pipeline — Why listings lack images, and how to fix it

_Investigation 2026-06-20. Three agents traced the event/restaurant image
pipeline end-to-end. This is the consolidated diagnosis + the fixes already
shipped + recommended next steps (some touch the core ingestion path and need
owner review/testing)._

## How an image gets onto a listing today

1. **Ingest** writes the row:
   - `scrape-events` (cron, every 30 min) → delegates entirely to
     `firecrawl-scraper`. **firecrawl-scraper never sets `image_url`.**
   - `restaurant-opening-scraper` (manual) inserts restaurants with no image.
   - `ai-crawler` (manual) is the only ingester that sets an image at insert.
2. **Backfill** fills the gaps: nightly `data-quality-heal` (02:30 UTC) calls
   `backfill-images` for ~25 rows/table. Per record it tries: scrape the row's
   **own** source_url → existing venue record → Google Places photo → category
   default.
3. **Apply**: the caller sets `table.image_url = cdnUrl`. There is **no DB
   trigger** copying `media_assets` → `image_url`; if app code doesn't set it, it
   stays NULL.
4. **Display**: web (gradient/"no image" placeholder) and iOS (placeholder +
   retry) both degrade gracefully — so the problem is **population, not display**.

## Root causes of imageless listings (ranked)

1. **The main event ingester sets no image.** `scrape-events` → `firecrawl-scraper`
   creates every event imageless, depending entirely on nightly backfill.
2. **Backfill drains slowly** (~25 rows/table/night) and **reprocesses permanent
   failures every run** (no "already tried" marker), so a real backlog can take
   weeks to clear and wastes effort re-trying hopeless rows.
3. **The last-resort fallback is inert** — `CATEGORY_DEFAULTS` in
   `_shared/imageFallbacks.ts` are all empty strings, so a row whose page yields
   no image and has no venue/Places match stays NULL forever.
4. **`restaurant-opening-scraper`** inserts restaurants with no image.
5. **Silent fetch rejects** in `fetchAndStoreImage` (SVG not in the MIME
   allowlist, >8 MB, non-200) drop images with no recovery.

## Correctness risks (wrong image attached)

1. **`ai-crawler` on listing/index pages**: feeds Claude a whole multi-item page
   and asks for a per-item `image_url`; with one page-level `og:image` and no
   item↔image binding, the page hero or a neighbour's thumbnail can be attached
   to many rows. Byte-dedup then formalizes it (one stored object, many records).
2. **SeatGeek adapter** uses the *performer* image — repeated across every tour
   date/game.
3. **Backfill fuzzy matches**: venue lookup is `ilike %name%` limit 1; Google
   Places is a name text query, maxResultCount 1 — a same-named wrong venue can
   attach the wrong photo.
4. **No subject validation** anywhere — nothing checks the image actually depicts
   the listing.

⚠️ This is why **blindly extracting a listing page's `og:image` at ingest is the
wrong fix** — it would attach one image to every event on the page.

## Shipped in this branch (safe, low-risk)

- **`find-image-candidates` edge function** (was missing → the admin manual-fix
  picker `ImagePickerDialog` was dead). Reuses existing helpers; SSRF-guarded +
  size-capped page fetch; read-only.
- **Dimension validation + SSRF guard** in `fetchAndStoreImage` (all callers):
  rejects sub-100px images parsed from header bytes (tracking pixels / favicons /
  badges / logos) so a row isn't marked "has image" with junk, and blocks
  private-IP / non-web URLs before fetching. `backfill-images` page scrape also
  SSRF-guarded.

## Recommended next steps (need owner review — touch core pipeline / need assets)

Ranked by leverage:

1. **Drain the backlog faster + stop re-trying failures.** Add an additive
   `image_checked_at timestamptz` column (events/restaurants/attractions),
   mirroring the existing `source_url_checked_at` pattern (WEB-AUTO-004). Have
   `backfill-images` set it on every attempt and order by it, and add a dedicated
   `backfill-images` cron every 2–4 hours (pg_cron, like
   `20251123000000_setup_cron_scraping.sql`, wrapped in `jobRunner.runJob`).
   Additive + safe per CLAUDE.md compat rules. **Biggest win for "lots of
   listings have no picture."**
2. **Per-item image at ingest (correct, not page-hero).** Extend the
   `firecrawl-scraper` Claude prompt to extract a per-item `image_url` ONLY when
   each item has its own image in the structured listing, and run it through
   `fetchAndStoreImage` post-insert (mirror `ai-crawler`). Gets images at ingest
   without the listing-page-hero cross-contamination. Needs careful testing — it
   edits the core ingestion path.
3. **AI relevance gate (accuracy).** Before storing a low-confidence candidate
   (page `<img>`, fuzzy Places), send it to Claude vision ("does this depict
   `<title>` in Des Moines?") using the existing `scraper.ts` vision plumbing
   (`fetchImageAsBase64` + `CLAUDE_API`). Behind a flag for cost control.
4. **Populate `CATEGORY_DEFAULTS`** with curated per-category fallback images
   (owner provides/curates the assets) so nothing is ever truly imageless.
5. **Allow SVG** (or convert) in `ALLOWED_IMAGE_MIME`, and have `image-transform`
   actually transform (its Sharp code is commented out).

## Key files

- `supabase/functions/firecrawl-scraper/index.ts` (ingest, sets no image)
- `supabase/functions/backfill-images/index.ts` (the gap-filler)
- `supabase/functions/_shared/imageStorage.ts` (`fetchAndStoreImage`, extraction, dimensions)
- `supabase/functions/_shared/imageFallbacks.ts` (venue / Places / empty defaults)
- `supabase/functions/find-image-candidates/index.ts` (new; admin picker backend)
- `src/components/admin/ImagePickerDialog.tsx` / `ImageBackfill.tsx` (admin UI)
