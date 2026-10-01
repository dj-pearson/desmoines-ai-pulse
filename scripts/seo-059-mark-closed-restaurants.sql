-- SEO-059: mark restaurants that have closed for good as status = 'closed'.
-- Run against production 2026-10-01. Rows backed up first to
-- scripts/content-backups/seo-059/restaurants-before.json.
--
-- Column: the existing restaurants.status (CHECK allows 'closed' since
-- 20250728165446). No migration. Every reader already treats 'closed' as gone:
-- the detail page and edge shell set noindex and print "Permanently closed",
-- generate-dynamic-sitemaps leaves it out, and the list hooks filter it.
--
-- WHAT SEO-058 NAMED, AND WHAT THE TABLE HOLDS (checked 2026-10-01):
--   Django, Malo, Juniper Moon, Star Bar, Gazali's, Papa Keno's, Vientiane,
--   Alegrias, Peace Tree, Americana: no row in public.restaurants.
--   jethros-bbq (721 3rd St), jethros-bbq-n-bacon-bacon (1480 22nd St WDM),
--   jethros-bbq-n-lakehouse (1425 SW Vintage Pkwy, Ankeny): NOT closed. All
--   three addresses are on https://www.jethrosdesmoines.com/locations fetched
--   2026-10-01. The location that burned in 2022 was on Forest Ave, and no row
--   has that address.
--   scratch-cupcakery (215 E 3rd St): NOT closed. The shop trades as Molly's
--   Cupcakes; https://mollyscupcakes.com/locations/ lists "215 East 3rd
--   Street, Suite 101, Des Moines" (fetched 2026-10-01). SEO-058's "metro shop
--   closed" was about Scratch's West Des Moines store, which has no row.
--
-- MARKED CLOSED HERE:
--   ritual-cafe   SEO-058 found it closed 2025-08-01 (seo-058 SQL, coffee
--                 crawl "What changed"); its domain https://www.ritualcafe.com/
--                 now redirects to a GoDaddy for-sale page (fetched 2026-10-01).
--   bistro-nomad  Google Places businessStatus CLOSED_PERMANENTLY, written to
--                 business_status by the SEO-054 run at 2026-10-01 05:33Z;
--                 bistronomad.com no longer resolves (2026-10-01).
--
-- TOP 150 BY GSC IMPRESSIONS (Keyword/...-2026-09-30/Pages.csv): 142 rows; 18
-- of the table's closed rows were already 'closed'. The 121 open/newly_opened
-- rows were checked against the business's own site on 2026-10-01. None showed
-- a closure. 37 could not be confirmed either way (no site, or the fetch was
-- refused, and the session's web-search quota was spent) and stay as they are.
-- Two moved rather than closed (taste-of-new-york, taste-of-new-york-pizza-bar:
-- tasteofnypizza.com lists 7450 Bridgewood Blvd, not 165 S Jordan Creek Pkwy);
-- that is an address fix, not a closure, and is left for an owner.
--
-- Guarded: only rows still 'open' change, so a re-run is a no-op.
--
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/seo-059-mark-closed-restaurants.sql

begin;

update public.restaurants
   set status = 'closed'
 where slug in ('ritual-cafe', 'bistro-nomad')
   and status = 'open'
   and is_merged is not true;

select slug, status, business_status, updated_at
  from public.restaurants
 where slug in ('ritual-cafe', 'bistro-nomad')
 order by slug;

commit;
