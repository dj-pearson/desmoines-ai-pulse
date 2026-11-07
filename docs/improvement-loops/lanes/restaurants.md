# Lane: restaurants

**Mission.** Make restaurant discovery trustworthy: accurate hours, open-now, menus, dietary filters, deals.

**Owns.** src/pages/Restaurant*.tsx, src/pages/DietaryRestaurants.tsx, src/pages/Deals.tsx, src/components/restaurants/, src/hooks/useRestaurants*, restaurant edge functions

**Backlog.** Open stories in `prd.json` with prefix WEB-FEAT (restaurant stories). See `../README.md` for the loop.

## Handoff

None. (When a loop splits work, write here: story id, what's done, what's next, files, traps.)

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-FEAT-035 | this commit | Restaurant pages list their in-date deals and happy hours (deals.entity_id), running-now first on the Central clock; vitest 2719/2719, validate green |
| 2026-11-07 | WEB-FEAT-037 | this commit | Open-now, Tonight dinner pairings and restaurant cards stop calling a Google CLOSED_TEMPORARILY / CLOSED_PERMANENTLY place open from its weekly hours (isServingToday reads business_status); vitest 2743/2743, type-check ratchet 61/61, check-list-columns ok |
| 2026-11-07 | WEB-FEAT-038 | this commit | Search pairings and map pins read business_status: /search skips a CLOSED_TEMPORARILY dinner (and now selects hours_json, without which pickDinner read `opening`, a date, and paired nothing), map pins say "Temporarily closed" and drop Google CLOSED_PERMANENTLY rows; both projections moved into listColumns.ts under check-list-columns; vitest 2801/2801, type-check ratchet 61/61, check-list-columns 12/12 |
| 2026-11-07 | WEB-FEAT-040 | this commit | Map pins colour from hours_json through resolveOpenStatus(hours_json, hoursTextOf(opening)), the open-now evaluator; RESTAURANT_MAP_POINT_COLUMNS selects hours_json, so a production row (date in `opening`) stops reading "Hours unknown". Negative control (hours_json dropped from the call) turns 2 tests red; vitest 2812/2812, type-check ratchet 61/61, check-list-columns 12/12 |
| 2026-11-07 | WEB-FEAT-036 | this commit | Restaurant page gets a Deals section chip and Restaurant JSON-LD makesOffer (Offer nodes with validFrom/validThrough, url #deals, no promo code), both from venuePageDeals, the same list the section renders, so a shut place or one with no in-date deal gets neither. Negative control (shut guard and empty check removed) turns 2 tests red; vitest 2840/2840, type-check ratchet 61/61, eslint clean |
