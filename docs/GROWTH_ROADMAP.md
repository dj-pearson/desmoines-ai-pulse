# Growth Roadmap

Decided 2026-11-07. Twenty growth ideas were proposed; this file records which
ones are approved, which are parked, and the order to build them. Update the
status column as work lands.

## Approved, in build order

Order is by how much already exists in the codebase and how fast each one pays
back, not by size of the idea.

### Phase 1: build on what's already there

| # | Idea | What exists today | What's missing | Status |
|---|---|---|---|---|
| 12 | Be the answer AI assistants give | `public/llms.txt`, GEO fields (`geo_summary`, `geo_key_facts`, `geo_faq`) on content tables, `api-events` / `api-restaurants` | A public, documented, cacheable events feed; `llms.txt` pointing at it; schema.org `Event` coverage audit on every detail page | Not started |
| 9 | Calendar sync | `src/lib/icsEvent.ts`, `src/lib/tripCalendar.ts`, `use-calendar-export` (one-off `.ics` downloads) | A subscribable `webcal://` feed per saved search / category, served by an edge function, so new events appear in the user's calendar without re-downloading | Built: `/calendar/<feed>.ics` (all, free, one per category), "Sync calendar" chip on /events. Personal saved-search feeds not yet. |
| 17 | Take a cut of conversions | Hotel affiliate URLs (`generate-hotel-affiliate-urls`), `AffiliatePartnersManager` | Reservation (OpenTable/Resy), rideshare and ticket affiliate links on restaurant and event detail pages; click tracking | Not started |
| 2 | Auto-claim every business | `AdminBusinessClaims`, `BusinessDashboard`, `agent-lead-sourcing`, `agent-outreach` | Outbound "your page got N views, claim it" campaign driven by real view counts; one-click claim link | Not started |
| 3 | Owner dashboard they check daily | `BusinessDashboard` | Per-listing views, saves, impressions, and a same-category neighborhood comparison; paid tier upsell | Not started |
| 11 | SEO page for every query with demand | `generate-pseo-page`, `pseo-batch-worker`, GSC sync | Scale up, gated on real data behind each page (minimum row count per page) so thin pages never ship | Not started |

### Phase 2: new user-facing features

| # | Idea | Notes | Status |
|---|---|---|---|
| 13 | Daily "Tonight in DSM" slideshow | Admin tool that turns the day's events into a 5-8 slide vertical slideshow (image + title + time + venue), exportable for TikTok/Reels/Shorts. Easy to create by hand, not an auto-generated video. Feeds `social-daily-poster`. | Not started |
| 7 | SMS concierge | No SMS provider in the codebase today. Needs a number (Twilio or similar) and an inbound webhook that calls `generate-itinerary`. | Skipped for now (2026-11-07) |
| 8 | Group planning with voting | Shareable poll link, no account needed to vote, winner gets booked. Each poll is an acquisition loop. | Not started |
| 10 | Insider perks | Negotiated perks at partner venues shown on the Insider membership. Business side first (sign 20-40 venues), then the in-app card. | Not started |

### Phase 3: bigger bets

| # | Idea | Notes | Status |
|---|---|---|---|
| 1 | Ticketing for small venues at 3-4% | Undercut Eventbrite, not free. Stripe Connect, fee computed server-side only (see "Money is decided on the server" in `CLAUDE.md`). Open question below. | Not started |
| 19 | Corporate relocation packages | B2B seats sold to HR at Principal, Wells Fargo, Corteva, etc.: neighborhood guides, 90-day calendar, perks bundle. | Not started |

### End goal

| # | Idea | Notes |
|---|---|---|
| 15 | Clone the city | Omaha, Cedar Rapids, Kansas City, Madison on one codebase. Everything built above should take a `city` / `market` dimension where it's cheap to add now, so this isn't a rewrite later. |

## Parked

| # | Idea | Revisit when |
|---|---|---|
| 4 | Pay people to submit events | Not yet |
| 5 | Person at venue box offices | Not yet |
| 6 | Live "happening now" map | More users and check-in data |
| 16 | Auctioned sponsored-pick slots | More traction |
| 18 | Sell aggregated data to the city / brokers | Legal review done |
| 20 | Run our own event series | Down the road |

## Dropped

| # | Idea | Why |
|---|---|---|
| 14 | White-label widget for local media | KCCI, the Register and Axios are competitors |

## Open questions

1. **Ticketing fee: decided 2026-11-07.** 3.5% platform fee, with Stripe
   processing (2.9% + $0.30) passed through to the buyer. Still well under
   Eventbrite's roughly 3.7% + $1.79 plus 2.9% processing.
2. **SMS provider and number.** Deferred with #7.
