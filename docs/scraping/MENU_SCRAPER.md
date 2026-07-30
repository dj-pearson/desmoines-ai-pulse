# Menu Scraper

How `supabase/functions/scrape-restaurant-menus` finds and reads a restaurant's
menu, why it is built this way, and what to do when a specific restaurant fails.

## The problem

Restaurants publish menus in mutually incompatible ways, and a scraper that
assumes any one of them fails on most of the rest. Across the Des Moines
restaurant set the shapes are roughly:

| Shape | Example of the pattern | What breaks a naive scraper |
|---|---|---|
| HTML page at `/menu` | classic WordPress / Squarespace site | nothing — this is the easy case |
| Menu split across pages | food / brunch / tap list as three pages | only one page gets read |
| PDF (often several) | one PDF per meal service | link text is "Download", not "Menu" |
| Photograph or exported graphic | JPEG with a hashed CDN filename, empty `alt` | nothing in the URL or alt says "menu" |
| Client-rendered widget | Toast, Popmenu, Square, ChowNow, Untappd | server HTML is an empty shell |
| Single-page site | the whole menu is on `/` | there is no menu link to follow |
| schema.org structured data | BentoBox, Popmenu, most restaurant themes | free exact data goes unused |

## Architecture

Three stages. Everything except orchestration lives in
`supabase/functions/_shared/menu/` and is unit-tested with no network access.

```
DISCOVER ──▶ EXTRACT ──▶ JUDGE
```

### 1. Discover — `menuDiscovery.ts`

Seeds from `restaurants.menu_url` and `restaurants.website`, then harvests from
each fetched page:

- **links** scored on anchor text, `aria-label`, href path, and file type. Off-site
  *pages* that are not a known menu platform are disqualified outright — a link to
  `/food-review` on someone else's domain is never this restaurant's menu — while
  off-site PDFs and images stay eligible, because menus are routinely CDN-hosted.
- **images**, reading `data-src` / `data-lazy-src` / `srcset` as well as `src`.
  Reading only `src` returns the 1×1 placeholder on every lazy-loading site, and
  Squarespace, Wix and most WordPress themes lazy-load by default.
- **iframes and embeds**, since a Popmenu or Toast widget means the parent page
  contains no menu text at all.
- **`hasMenu` URLs** from schema.org — the site stating where its own menu is.
- **the sitemap**, when nothing else looked promising. This is the adaptive
  fallback for a menu at a path no pattern list would guess.

Guessed URL patterns (`/menu`, `/eat`, `/tap-list`, …) are the *last* discovery
resort, not the first move, so a site that links its menu costs one fetch
instead of twenty.

### 2. Extract — cheapest and most precise first

| Order | Method | Cost | Module |
|---|---|---|---|
| 1 | schema.org JSON-LD | free | `menuJsonLd.ts` |
| 2 | platform's embedded JSON state | free | `menuPlatforms.ts` |
| 3 | PDF via Claude Vision | 1 call | `menuLlm.ts` |
| 4 | images via Claude Vision (batched) | 1 call | `menuLlm.ts` |
| 5 | prepared page text via Claude | 1+ calls | `menuLlm.ts` |

Pages that a plain `fetch` returns as an empty shell — detected by platform
fingerprint or by a markup-to-text ratio with no prices — are re-fetched through
`_shared/scraper.ts`'s Browserless/Firecrawl backends. Escalation is conditional,
so an ordinary server-rendered site still costs one cheap request.

Page text is prepared by `menuContent.ts`, which preserves block structure as
line breaks (so a name, its description and its price stay associated) and then
windows on **price density** rather than keeping the first N characters.

Claude is given a tool with an input schema and told to call it, so the reply
shape is guaranteed by the API. Long inputs are chunked at blank-line
boundaries, because a 90-item menu does not fit in one `max_tokens` response.

### 3. Judge — `menuNormalize.ts`

Every extraction, whatever produced it, is normalized identically: junk items
dropped, prices re-parsed, dietary shorthand read, duplicates merged. Then it is
scored 0–1 on item count, section count, priced ratio, described ratio and
section naming.

- Nothing below `QUALITY_THRESHOLD` (0.25) or `MIN_ITEMS` (3) is published.
- Results that pass are **merged**, highest-scoring first, each contributing only
  items the others lack. This is what reassembles a split menu.
- Ties are broken toward the more precise method: structured data over Vision
  over text extraction.

## Failure diagnosis

Every attempt is written to `menu_scrape_attempts` (admin-readable). Start with:

```sql
SELECT * FROM menu_scrape_health(30);
```

`last_outcome` distinguishes the failure modes that used to look identical:

| Outcome | Meaning | Usual fix |
|---|---|---|
| `success` | published | — |
| `rejected` | menu-shaped data that failed the quality gate | check `detail` for the warnings; often a teaser, not the menu |
| `empty` | source read fine, contained no menu | wrong page — set `menu_url` |
| `error` | fetch or API failure | site blocking us, or a dead link |
| `skipped` | not worth an attempt | too few menu signals, or no fetchable image |

The single most effective operator action is still setting
`restaurants.menu_url` in the admin Menu URL Manager. It is used as a seed, and
if it points directly at a PDF or an image it is read as one.

To see what would happen without writing anything:

```jsonc
// POST scrape-restaurant-menus
{ "restaurant_id": "…", "force_update": true, "dry_run": true }
```

## Budgets

Per restaurant: 18 fetches, 6 Claude calls, 110s wall clock. Per invocation:
260s, after which the run returns `deadline_reached: true` and `remaining`
rather than being killed mid-write. These exist so one pathological site cannot
consume an entire invocation.

## Tests

```bash
deno test --allow-none supabase/functions/_shared/menu/menuNormalize.test.ts
deno test --allow-none supabase/functions/_shared/menu/menuContent.test.ts
deno test --allow-none supabase/functions/_shared/menu/menuJsonLd.test.ts
deno test --allow-none supabase/functions/_shared/menu/menuPlatforms.test.ts
deno test --allow-none supabase/functions/_shared/menu/menuDiscovery.test.ts
deno test --allow-none supabase/functions/_shared/menu/menuJson.test.ts
deno test --allow-none supabase/functions/_shared/menu/menuUrls.test.ts
```

All fixture-based, no network. Run in CI by `subscription-sync-tests.yml` on any
change under `supabase/functions/`.

## Extending it

- **A new menu platform**: add a host/markup fingerprint to `menuPlatforms.ts`.
  If its menu is server-rendered, leave it out of `JS_RENDERED` so it does not
  pay for a headless browser. The embedded-state reader is structure-driven, not
  platform-specific, so it often works on a new platform with no code at all.
- **A new URL shape**: add to `MENU_PATH_PATTERNS.tier2` in `menuDiscovery.ts`.
  Prefer improving link/sitemap discovery over lengthening this list — patterns
  cost a request each.
- **A new dietary tag**: add to `DIETARY_TAGS` in `types.ts` and a pattern in
  `menuNormalize.ts`. The tool schema's enum is generated from that constant.
- **Tuning the quality gate**: `scoreExtraction` in `menuNormalize.ts`. The
  weights are pinned by tests that assert a brewery tap list (no prices, one
  section) publishes while a four-item homepage teaser does not — check those
  still hold.
