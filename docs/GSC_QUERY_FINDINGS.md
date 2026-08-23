# What Search Console actually says (WEB-SEO-014 AC5)

AC4 says the keyword matrix in `SEO_GEO_COMPETITIVE_STRATEGY.md` section 5 is built from
SERP observation rather than our own impressions, and must be re-derived from real data
before any Tier 2 or Tier 3 page is built. This is that data.

**Window: 2026-02-28 to 2026-03-28, 29 days.** That is everything we have — the sync ran
once and was never scheduled (WEB-SEO-014 AC3), so the numbers are five months old. They
are still measured rather than assumed, which is the point of AC4.

**Totals.** 14,781 impressions and 72 clicks across 254 pages; 671 distinct queries in the
keyword table (GSC returns a sampled subset of queries, which is why that total is lower
than the page total).

---

## 1. Every single query is non-brand

| | queries | impressions | clicks |
|---|---|---|---|
| brand (`des moines insider`, `desmoinesinsider`) | **0** | 0 | 0 |
| non-brand | 671 | 2,875 | 72 |

Not "mostly non-brand" — **zero brand queries in 29 days.** Nobody is searching for us by
name.

This is the finding that should shape strategy, and it cuts both ways. Every impression is
earned on discovery intent, so there is no brand-search floor to fall back on and no
loyalty cushion; equally, there is no wasted effort defending a brand term. Any plan that
assumes returning visitors arrive via search is assuming something that is not happening.

## 2. Hubs are the near-zero-CTR problem, not entity pages

| page kind | pages | impressions | clicks | CTR |
|---|---|---|---|---|
| entity detail (`/restaurants/<slug>` etc.) | 178 | 9,950 | 70 | **0.70%** |
| hubs and everything else | 76 | 4,831 | 2 | **0.04%** |

I expected the opposite before running it — that the entity pages would be the dead ones,
since they are the URLs WEB-SEO-006 shows serving the homepage. They are not. Entity pages
carry 97% of the clicks.

The hubs are where the impressions go nowhere:

| page | impressions | clicks | avg position |
|---|---|---|---|
| `/events` | 391 | 0 | **42.2** |
| `/stay` | 235 | 0 | **40.6** |
| `/restaurants/open-now` | 300 | 0 | 18.4 |

At average position 40 the near-zero CTR is not a title problem, it is a ranking problem —
almost nobody sees result 40. Rewriting those titles would change nothing.

The genuine title/description candidates are the entity pages that rank on page one and
still get nothing:

| page | impressions | clicks | avg position |
|---|---|---|---|
| `/restaurants/flipn-jacks-pancake-house-eatery-2` | 800 | 0 | **10.1** |
| `/restaurants/merlls-pub-patio` | 254 | 0 | 10.9 |
| `/restaurants/zekes-rooftop-grill` | 179 | 0 | 10.2 |
| `/restaurants/bubbies-pleasant-hill` | 182 | 0 | 11.0 |

800 impressions at position 10 with zero clicks is a snippet failing, not a rank failing.

The `-2` suffix on the first one turned out to be a real defect, and a costly one -- see
below.

### The `-2` suffix: two of our best search assets compete with themselves

`flipn-jacks-pancake-house-eatery-2` is not a slug collision with an unrelated business. It
is the SAME restaurant, listed twice, because the two rows spell the name with different
apostrophes:

    Flip’N Jacks Pancake House & Eatery   ->  flipn-jacks-pancake-house-eatery-2
    Flip'N Jacks Pancake House & Eatery   ->  flipn-jacks-pancake-house-eatery

U+2019 versus U+0027. Seven restaurant names use the curly form, 109 the straight one, and
two of them have produced a duplicate pair:

| normalised name | slugs |
|---|---|
| daves hot chicken | `daves-hot-chicken`, `daves-hot-chicken-2` |
| flipn jacks pancake house & eatery | `flipn-jacks-pancake-house-eatery`, `flipn-jacks-pancake-house-eatery-2` |

Both are near the top of this report. `flipn-jacks-...-2` is the single highest-impression
page in the window (800). `dave's hot chicken west des moines` is the second-highest query
(156 impressions, average position 11.0) and the strongest page-2 opportunity in section 3.

So the two best-performing entities in the entire dataset are each split across two URLs
that compete with each other for the same query. Filed as WEB-SEO-019.

Pages that DO convert, for contrast: `/restaurants/jungle-tea` at 16.07%,
`/restaurants/canopy` at 75% (8 impressions, so treat as noise),
`/restaurants/marvs-mainstreet-dive` at 15.79%.

## 3. Fastest wins: page 2 restaurant-name queries

Queries averaging position 11–30 with at least 5 impressions. These need a rank nudge, not
new content — the page already exists and already almost ranks:

| query | impressions | clicks | avg position |
|---|---|---|---|
| dave's hot chicken west des moines | 156 | 2 | 11.0 |
| club car restaurant | 59 | 0 | 14.3 |
| burrito bar | 37 | 0 | 20.1 |
| club car west des moines | 29 | 0 | 15.2 |
| club car des moines | 21 | 0 | 14.1 |
| bubbies bbq pleasant hill | 20 | 0 | 13.4 |
| corner cafe urbandale | 19 | 0 | 14.6 |
| dave's hot chicken des moines iowa | 19 | 0 | 12.1 |
| dave's hot chicken near me | 18 | 0 | 12.3 |
| chicago speakeasy hours | 15 | 0 | 11.6 |

Every one is a **named restaurant plus a place**, and several cluster on the same business
("club car" x3, "dave's hot chicken" x3). Note `chicago speakeasy hours` and
`anchors away ankeny menu` — hours and menu are the intent, which is a content shape, not
a keyword.

---

## What this means for the section 5 matrix

1. **The matrix should be built from restaurant-name-plus-place queries**, because that is
   what we actually rank for. Nothing in this data supports a category-term strategy — the
   highest-impression generic query is `breakfast west des moines` at 38 impressions and
   average position 40.
2. **Hub pages need ranking work before they need copy work.** Position 40 is not a
   snippet problem.
3. **Entity pages on page one with 0% CTR are the cheapest available win** and are a
   title/description exercise, not a content one.
4. **There is no brand demand to build on.** Plan accordingly.

## Caveats, stated rather than buried

- 29 days, ending five months ago. Seasonality alone makes late-February to March a poor
  proxy for August in an events business.
- 72 clicks is a small denominator. Every CTR here is directional.
- GSC samples the query dimension, so the keyword table under-counts relative to the page
  table. Compare within a table, not across.
- None of this can be refreshed until `gsc-sync-data` is scheduled, and the refresh token
  lapses around 2026-09-30 (WEB-SEO-014). After that it is not a scheduling fix.
