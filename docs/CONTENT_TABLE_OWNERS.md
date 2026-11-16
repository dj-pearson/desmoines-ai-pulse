# Seeded content tables: keep or delete

WEB-BE-055 asked for a decision on six tables that were created and seeded on
2026-02-28 and then left with no admin surface and no process feeding them.
Decided 2026-11-16. Every one of them is kept: each backs a public route that
is live today, and deleting one means deleting that route plus a 301 kept for a
release cycle (CLAUDE.md, URL params and route shapes).

| Table | Public reader | Decision | Admin surface |
|---|---|---|---|
| `seasonal_guides` | `/guides`, `/guides/:slug` (useSeasonalGuides) | Keep. SEO-019: seasonal editorial is what ranks | `/admin/guides` (done) |
| `venues` | `/music/venues/:slug`, `/music`, event-page hotel callout, `/stay/near/:slug` (useVenues) | Keep. SEO-018 wants venue pages fed with verified facts | `/admin/venue-pages` (done; create and edit, no delete) |
| `curated_itineraries` | `/itineraries`, `/itineraries/:slug` (useItineraries) | Keep | Not built yet. Its "Admins can manage itineraries" policy already allows full CRUD |
| `trails` | `/outdoors`, `/outdoors/:slug` (useTrails) | Keep | Not built yet. RLS allows admin insert and update, no delete |
| `teams` | `/sports`, `/sports/:slug` (useTeams) | Keep | Not built yet. RLS allows admin insert and update, no delete |
| `meeting_venues` | `/group-travel` (useMeetingVenues) | Keep | Not built yet. RLS allows admin insert only; editing needs an additive UPDATE policy first |

## Two tables called venues

`venues` is the public page table above. `known_venues` is the ingest matching
table (`_shared/knownVenues.ts`, aliases, coordinates for scraped events) and is
what the "Venues" tab under `/admin/content` edits. They are not linked. A fix
to a venue's address on one does not reach the other.

## No delete on venues, trails or teams

Their RLS has no DELETE policy, so an admin delete would return zero rows. That
is the right default for a table whose rows are public URLs. If a delete is
ever wanted, it needs an additive policy migration and a decision about the
inbound links.
