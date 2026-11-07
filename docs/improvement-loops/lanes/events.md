# Lane: events

**Mission.** Make event discovery the best way to find something to do in Des Moines tonight, this weekend, and this season.

**Owns.** src/pages/Events*.tsx, src/pages/EventDetails.tsx, src/components/events/, src/hooks/useEvents*, supabase/functions/firecrawl-scraper, ai-crawler, _shared/knownVenues.ts, calendar feed functions

**Backlog.** Open stories in `prd.json` with prefix WEB-FEAT (event stories), XPLAT (event stories). See `../README.md` for the loop.

## Handoff

**WEB-BE-049 AC3/AC4 (price), slice 1 of 3 done 2026-11-07.**

- Done: `_shared/jsonLdOffers.ts` `priceFromOffers()` turns schema.org `offers` / `isAccessibleForFree` into the events.price text ("Free", "$25", "$25-$60", "Free - $20"). Catch Des Moines detail pages, the generic JSON-LD extractor and the Vibrant adapter all use it; Catch Des Moines used to write "See website" for every row.
- Next (slice 2): additive migration for `events.price_min numeric NULL` and `events.is_free boolean NULL`, filled by a BEFORE INSERT/UPDATE trigger that parses `price` in SQL, plus a backfill. A trigger, not writer changes, because edge functions deploy separately from migrations: a writer that sends a column the table does not have yet fails every insert (PGRST204).
- Next (slice 3, only after slice 2 is applied and types.ts regenerated): free-events pages and FREE_PRICE_FILTER read `is_free`; an "under $20" filter reads `price_min`. Event JSON-LD can keep parsing the text (src/lib/eventOffers.ts already does it correctly).
- Also open on the ingest side: SeatGeek and hyveetix still write "From $X" from a single lowest price (fine for the readers); eventbrite and barnstormers hardcode "See website" and their feeds were not checked for a price field.
- Trap: `src/lib/eventOffers.ts` `parseEventPrice(null or "")` returns `free`, so a row with no price at all gets an Offer of $0 in JSON-LD, while `isFreePrice` treats the same row as unknown. Ingest never writes null today ("See website" everywhere), which is the only reason it does not show.

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-BE-049 (AC3 slice 1) | this commit | One `priceFromOffers()` for ld+json offers; Catch Des Moines, jsonLdEvents and Vibrant write real prices. 44 Deno cases pass under a node shim (no deno binary), negative control fails as expected. |
