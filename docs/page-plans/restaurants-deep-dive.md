# Restaurants deep dive (2026-11-21)

A visitor commented that the nightly social post featured a restaurant that closed about six years ago. That started a review of how the site finds closed restaurants, which widened into the whole restaurant product: design and UX, the information shown, and how listings are managed.

Thirty stories came out of it and are filed in `prd.json`. This document is the evidence behind them.

## How to read this

- The code was read on `main` at `e7c38d59`, which is what production serves. File and line references are from that tree. `develop` differed from `main` by 1,287 files on the day this was written, so a line number may be off on `develop`.
- Production was not queried. There are no Supabase credentials in the audit container. Anything that depends on row contents, or on whether a cron job fires, is marked unverified.
- Some stories cite older story ids (for example WEB-UX-082, WEB-FEAT-079) that exist in `main`'s `prd.json` and not yet in `develop`'s.
- Pixel figures come from Tailwind class arithmetic, not browser measurement.

## Part 1: closed restaurants

Nothing in the promotion paths checks that a restaurant is open, and the job that detects closures cannot see most closed places.

| Finding | Evidence | Story |
|---|---|---|
| The social poster, the social manager fallback and the weekly digest pick restaurants with no open check | `social-daily-poster/index.ts:115`, `social-media-manager/index.ts:758`, `assemble-weekly-digest/index.ts:134` | WEB-BE-063 |
| The daily refresh re-reads only rows with a place id and stored hours; rows without a place id are never checked; a Places 404 is counted and ignored | `bulk-update-restaurants/index.ts:224-253`, migration `20261108000103` | WEB-BE-064 |
| The cron writes `business_status` only and the admin button writes `status` only | `GooglePlacesRestaurantTools.tsx:425-431`, `src/lib/restaurantStatus.ts:137-157` | WEB-BE-065 |
| The table has never been checked end to end | n/a | WEB-OPS-026 |
| A visitor cannot report a closure and there is no review queue | grep of `src` and `supabase` | WEB-FEAT-102 |
| Nothing alerts when listings go unverified | n/a | WEB-AUTO-019 |

The rule WEB-BE-063 sets: a restaurant is promoted only when Google said it was operating within the last 30 days. Unknown is not promotable.

## Part 2: information

### Where each piece comes from

| Information | Source | Stored in | Refreshed | Notes |
|---|---|---|---|---|
| Hours, open now | Google Places | `hours_json`, `hours_checked_at` | Daily cron, 20 rows, 30-day staleness | Shown with a checked date |
| Closed status | Google Places, admin button | `business_status`, `status` | Same cron, partial coverage | See part 1 |
| Rating | Places at first enrichment; also two model-driven paths | `rating` | Never | Shown as "Google rating", no date, no count |
| Our reviews | Signed-in visitors | `user_ratings`, `content_rating_aggregates` | Live | Zero restaurant ratings recorded on 2026-10-01 |
| Menu items, prices | Scrape of the restaurant's site, upload | `restaurant_menus`, `restaurant_menu_items` | Admin click only | Shown with a captured date |
| Dietary tags | Model output plus regex over dish text | `restaurant_menu_items.dietary_tags` | With the menu | Regex over-tags |
| Photo | Scrape of the restaurant's site, admin URL | `image_url` | Fill only, 6-hourly for imageless rows | One image |
| Price | Admin Places tool at insert, page text, model, default | `price_range` | Never | Attributed to Google regardless |
| Phone, website, address, cuisine | Places at first enrichment, scrapers, admin | columns of the same name | Never | |
| Reservations | Places `reservable`; curated link | `reservable`, `reservation_url` | Once; the link has no writer | Reserve button hidden on most rows |
| Deals | Admin only | `deals` | Manual | Open-ended deals never expire |
| Description | Places summary, scrapers, model, admin | `description` | Once | Unlabelled |
| AI copy | `generate-seo-content` | `geo_*`, `ai_writeup` | Admin click only for restaurants | Badged, undated |

There is no "last verified" date for a listing. The page prints "Listing last updated" from `updated_at`, which a trigger moves on every write, so an hours re-check alone makes a listing look freshly reviewed.

### Findings

| Finding | Evidence | Story |
|---|---|---|
| The daily auto-enrich job sends ids the enrichment function never reads, re-enriches an arbitrary batch, and nulls descriptions | `auto-enrich-restaurants/index.ts:110-129`, `bulk-update-restaurants/index.ts:346,383-391,627-629` | WEB-BE-066 |
| Two ingestion paths write defaults and model guesses (cuisine "American", price "$$", a rating) | `firecrawl-scraper/index.ts:779-791`, `enhance-content/index.ts:206` | WEB-BE-068 |
| Rating, phone, website, price and reservability are frozen at first fetch; price is credited to Google when Google did not supply it | `placeHours.ts:158`, `bulk-update-restaurants/index.ts:520` | WEB-BE-070 |
| Menus never refresh unattended and keep publishing prices | `scrape-restaurant-menus/index.ts:135`, `MenuSchema.tsx:57-66` | WEB-BE-071 |
| Dietary badges are inferred by regex, including "(GFO)" and "veggie" | `menuNormalize.ts:82-93,116-119` | WEB-BE-072 |
| Every title promises "Reviews" and the page has none | `restaurantMeta.ts:178` | WEB-SEO-079 |
| Copy is one-shot, partly unlabelled and undated | `RestaurantDetails.tsx:1012-1024` | WEB-BE-077 |
| Deals have no confirmation date | `useDeals.ts:72` | WEB-FEAT-104 |

## Part 3: design and UX

All of these are phone-first problems. Filters, loading and error states, card accessibility and the hours display were checked and are sound.

| Finding | Evidence | Story |
|---|---|---|
| `/restaurants/open-now` shows a full filter form and no restaurant on the first phone screen | `OpenNowRestaurants.tsx:456-626` | WEB-UX-084 |
| `/restaurants` shows a 20-row text list before any filter or photo | `Restaurants.tsx:870-877`, `RestaurantsTopRated.tsx:52-75` | WEB-UX-085 |
| Two of four filters are off-screen, active chips eat the viewport, the search box leaves about 110px to type in, the map toggle is only in the hero | `RestaurantInlineFilters.tsx:202`, `Restaurants.tsx:743-773,819-848,916` | WEB-UX-086 |
| About one and a half cards per phone screen, and no Call or Directions on a card | `RestaurantCard.tsx:278-424` | WEB-UX-087 |
| The detail page repeats facts three or four times and stacks three control strips above the hours | `RestaurantDetails.tsx:596-1036` | WEB-UX-088 |
| A closed restaurant's page still offers Website, Menu and Rate | `RestaurantDetails.tsx:724-838,1049-1057` | WEB-UX-089 |
| "Best" orderings rest on a rating with no review count and a randomly seeded popularity score | `restaurantRanking.ts:13-18,135-143`, `useRestaurants.ts:456-484` | WEB-BE-076 |
| Small defects: duplicate empty-state buttons, "0+ stars", a mismatched skeleton, hero radius | see story | WEB-UX-090 |

## Part 4: management

### Who writes what

| Writer | Trigger | Columns |
|---|---|---|
| Admin Places tool | Click per search result | Insert with name, location, phone, website, rating, price, place id, cuisine; `status = closed` button |
| Admin edit dialog | Create or edit | Insert: 13 form fields. Update: the whole list row |
| Owner (`update_claimed_listing`) | Verified owner | description, website, phone, image_url, menu_url |
| `bulk-update-restaurants`, enrich mode | Admin button, nightly via auto-enrich | cuisine, location, rating, description, phone, website, place id, reservable, photos, status, hours |
| `bulk-update-restaurants`, hours modes | Daily cron, admin buttons | hours_json, business_status, hours_checked_at |
| `restaurant-opening-scraper` | Admin button only | Inserts openings; status forward only; fills blanks |
| `ai-crawler`, `firecrawl-scraper` | Admin crawl runs | Inserts |
| `data-quality-heal` | Nightly cron | Coordinates; delegates images and SEO copy |
| `merge_duplicate_content` | Weekly cron, admin Merge | Merge flags on the loser; children repointed |
| Campaign activation | Campaign lifecycle | is_sponsored, sponsored_until |

### Findings

| Finding | Evidence | Story |
|---|---|---|
| Saving any admin edit writes the stale list row back, including sponsorship, hours and closure columns | `ContentEditDialog.tsx:200,279,295-298,339` | WEB-BE-067 |
| Owner and admin corrections are overwritten by the next enrichment | `bulk-update-restaurants/index.ts:613-637` | WEB-BE-069 |
| Nothing advances announced to open; discovery and the opening scraper are button-only | `scripts/check-stale-openings.ts:8-22`, `AdminAI.tsx:129-134` | WEB-BE-073 |
| Merging drops the loser's data, strands claims, and Undo has no UI | migration `20260612000010:98-213`, `MergeReviewPanel.tsx:136` | WEB-BE-074 |
| No per-row change history; `updated_at` is meaningless as a freshness signal; job docs are stale | migration `20250728200000:78` | WEB-BE-075 |
| The admin cannot see or edit place id, hours, status or reservation link; delete is a hard delete | `ContentEditDialog.tsx:51-66`, `AdminContent.tsx:318` | WEB-FEAT-103 |
| A pending claim notifies nobody, and a verified owner cannot be revoked | `BusinessClaimsManager.tsx:62,104-114` | WEB-ADS-047 |
| Owners cannot edit hours or report a closure, and the claim page says they can edit hours | migration `20260920000005:319`, `ClaimListing.tsx:28` | WEB-ADS-048 |

## Order of work

1. **Stop the damage (priority 1).** WEB-BE-063, WEB-BE-066, WEB-BE-067, WEB-BE-068. Each is small and each is writing or publishing wrong data today.
2. **Make detection real.** WEB-BE-064, then the sweep in WEB-OPS-026.
3. **Make corrections stick.** WEB-BE-069, then WEB-BE-070 and WEB-ADS-048, which depend on it.
4. **Phone experience.** WEB-UX-089, 084, 085 and 086 are small; 087 and 088 are medium.
5. **The rest**, in priority order from `prd.json`.

## Owner actions that need production access

- Check `automation_job_runs` for `auto-enrich-restaurants` and `bulk-update-restaurants-hours` to learn whether those crons fire.
- Count restaurants with a null description and compare against a backup (WEB-BE-066).
- Look up the restaurant from the social post and note its `google_place_id`, `business_status`, `status` and `hours_checked_at`. That tells which gap it fell through.
- Pause restaurant posts in Admin, Social, Automation until WEB-BE-063 ships.
