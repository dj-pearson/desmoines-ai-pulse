# Lane: events

**Mission.** Make event discovery the best way to find something to do in Des Moines tonight, this weekend, and this season.

**Owns.** src/pages/Events*.tsx, src/pages/EventDetails.tsx, src/components/events/, src/hooks/useEvents*, supabase/functions/firecrawl-scraper, ai-crawler, _shared/knownVenues.ts, calendar feed functions

**Backlog.** Open stories in `prd.json` with prefix WEB-FEAT (event stories), XPLAT (event stories). See `../README.md` for the loop.

## Handoff

**WEB-BE-049 AC3/AC4 (price), slices 1 and 2 of 3 done 2026-11-07.**

- Done (slice 1): `_shared/jsonLdOffers.ts` `priceFromOffers()` turns schema.org `offers` / `isAccessibleForFree` into the events.price text. Catch Des Moines, the generic JSON-LD extractor and Vibrant use it.
- Done (slice 2): migration `20261107000080_events_price_min_is_free.sql` adds `events.price_min numeric NULL` and `events.is_free boolean NULL`, filled by `trg_events_price_derived` (BEFORE INSERT OR UPDATE, overwrites anything a client sends) from `event_price_is_free()` / `event_price_min()`, plus an idempotent backfill and two partial indexes. `is_free` is true exactly when `isFreePrice()` is, false when a nonzero amount is named, NULL when unknown; `price_min` is `parseEventPrice()`'s low end, 0 for a free tier. `src/lib/__tests__/eventPriceSqlParity.test.ts` guards the free branch against `isFreePrice`/`FREE_PRICE_FILTER`.
- Next (slice 3, only after the migration is applied and types.ts regenerated): free-events pages and the hub free filter read `is_free = true` instead of FREE_PRICE_FILTER (nlp-search/search.ts and _shared/savedSearchMatch.ts mirror that filter too); an "under $20" filter reads `price_min`. Selecting either column before the migration is live is 42703 on the whole query.
- Known difference the switch will make: FREE_PRICE_FILTER's `price.eq.$0,price.eq.0` are exact, so "$0.00" and "0.0" are free on the badge but missing from the filter. `is_free` follows the badge, so slice 3 gains those rows and loses none.
- Also open on the ingest side: SeatGeek and hyveetix write "From $X" from a single lowest price (fine for the readers); eventbrite and barnstormers hardcode "See website" and their feeds were not checked for a price field.
- Trap: `src/lib/eventOffers.ts` `parseEventPrice(null or "")` returns `free`, so a row with no price gets a $0 Offer in JSON-LD while `isFreePrice` and now `is_free` call it unknown. Ingest never writes null today ("See website" everywhere), which is the only reason it does not show.
- Trap: the range regex's `\u2010-\u2015` escapes only work in a UTF8 database. A scratch `initdb` defaults to SQL_ASCII, where dashed ranges silently read as unknown; use `initdb -E UTF8 --locale=C.UTF-8` to test.

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-BE-049 (AC3 slice 1) | this commit | One `priceFromOffers()` for ld+json offers; Catch Des Moines, jsonLdEvents and Vibrant write real prices. 44 Deno cases pass under a node shim (no deno binary), negative control fails as expected. |
| 2026-11-07 | WEB-BE-049 (AC3 slice 2) | this commit | events.price_min / events.is_free derived by a BEFORE trigger + backfill. Applied twice to a scratch Postgres 16 (UTF8): 61-case corpus through the trigger matches isFreePrice/parseEventPrice, 0 mismatches; negative control (drop the nonzero refusal) gives 4. vitest 2765/2765, type-check ratchet 61/61. |
