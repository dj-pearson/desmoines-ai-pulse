-- SEO-048: November-December seasonal wave, run against production 2026-10-01.
--
-- Every date, time and price below was read on 2026-10-01 from the city's or
-- venue's own page (URLs in each article's Sources list). Nothing was guessed;
-- a city or venue that had not posted 2026 details is listed as not confirmed.
-- No existing row is updated, so there is nothing to back up. The soups article
-- (soups-on-15-must-try-...) was already rewritten in place by SEO-058 today
-- (updated_at 2026-10-01 05:44 UTC), so it is skipped here.
--
-- 1. INSERT published  trick-or-treat-times-des-moines-suburbs-october-2026
--    7 cities verified (Ankeny, Urbandale, Waukee, Johnston, Grimes, Altoona,
--    Windsor Heights), all Sat Oct 31, 6-8 pm. Not confirmed: Des Moines (last
--    notice covers 2025), Norwalk (2025 notice only), Clive, Pleasant Hill,
--    Bondurant, Indianola, Carlisle (nothing posted); West Des Moines and Polk
--    City returned HTTP 403 to every fetch, so they could not be checked.
--    Inserted with session_replication_role = replica so the publish webhook
--    (AI social-post generation) does not fire. Replica mode also skips the
--    slug, word-count, sitemap-queue and SEO-058 body-guard triggers, so slug
--    and word_count are set here, the sitemap_change_queue row is written by
--    hand, and public.article_body_problem() is called first and aborts the
--    transaction if it objects.
--
-- 2. INSERT draft (fewer than five verified entries; not published):
--    holiday-lights-des-moines-2026         2 verified (Botanical Garden Dome
--        for the Holidays; East Village Holiday Promenade). Gaps: Jolly Holiday
--        Lights (jollyholidaylights.org root still shows the 2023-24 schedule,
--        and /schedule now serves gambling spam: do not link it), Adventureland
--        (403), Blank Park Zoo, Living History Farms, Iowa State Fair (no 2026
--        holiday listing found on their home pages).
--    ice-skating-des-moines-2026            1 venue, no 2026 dates (Brenton
--        Skating Plaza: prices and "November to March" only). Gaps: Brenton
--        2026 opening date; indoor rinks (Buccaneer Arena, the MidAmerican
--        RecPlex) - their domains did not resolve or the city site returned 403.
--    thanksgiving-dinner-out-des-moines-2026  0 verified. Restaurants had not
--        posted 2026 Thanksgiving menus or hours; revisit after Oct 20.
--    small-business-saturday-valley-junction-east-village-2026  0 verified.
--        valleyjunction.com and eastvillagedesmoines.com list no 2026 Small
--        Business Saturday event yet (East Village lists the Holiday Promenade
--        Window Display Contest on Fri Nov 27, recorded in the draft).
--    Drafts go through the normal triggers (the webhook fires only on a
--    transition to published). Each draft body opens with a bracketed
--    "to be added" marker that public.article_body_problem() flags, so the
--    SEO-058 guard refuses to publish a draft until the marker is removed.
--    (The guard reports it as "JSON or code-fence dump" because the body
--    opens with "["; checked in a rolled-back run before the real one.)
--
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/seo-048-seasonal-articles.sql

begin;

-- 1. Trick-or-treat times (published) ---------------------------------------
create temp table seo048_trick on commit drop as
select
  'Trick-or-Treat Times in Des Moines and Suburbs (2026)'::text as title,
  'trick-or-treat-times-des-moines-suburbs-october-2026'::text as slug,
  $c$**Updated October 1, 2026.** Every date and time below comes from the city's own website as it read on that day. We'll add cities as they post their 2026 hours.

Seven metro cities have posted their 2026 trick-or-treat hours so far, and all seven chose the same slot: **Saturday, October 31, from 6 to 8 pm**. Des Moines hasn't posted 2026 hours yet; its most recent announcement covers 2025.

The old Des Moines habit of trick-or-treating on October 30, Beggars' Night, is fading. In December 2024 the City of Des Moines said most metro communities would move trick-or-treating to Halloween itself for 2025, after a resident survey in which 49.5% preferred October 31, against 24.6% for October 30 and 25.9% for the Saturday before Halloween. Ankeny's 2026 calendar entry says Beggars' Night "has moved permanently to Halloween".

For haunted houses, pumpkin patches and everything else this month, see the [October 2026 events calendar](/events/october-2026).

## 2026 trick-or-treat times by city

| City | 2026 date | Hours | Source |
|---|---|---|---|
| Altoona | Saturday, October 31 | 6-8 pm | [City news post](https://www.altoona-iowa.com/news_detail_T2_R326.php) |
| Ankeny | Saturday, October 31 | 6-8 pm | [City calendar](https://www.ankenyiowa.gov/Calendar.aspx?EID=3568) |
| Grimes | Saturday, October 31 | 6-8 pm | [City news post](https://www.grimesiowa.gov/m/newsflash/Home/Detail/1519) |
| Johnston | Saturday, October 31 | 6-8 pm | [City calendar](https://www.cityofjohnston.com/Calendar.aspx?EID=4147) |
| Urbandale | Saturday, October 31 | 6-8 pm | [City calendar](https://www.urbandale.org/Calendar.aspx?EID=4364) |
| Waukee | Saturday, October 31 | 6-8 pm | [City calendar](https://www.waukee.org/Calendar.aspx?EID=9876) |
| Windsor Heights | Saturday, October 31 | 6-8 pm | [City calendar](https://www.windsorheights.org/Calendar.aspx?EID=1551) |

## Not confirmed yet

These cities had not posted 2026 hours on their own sites when we checked on October 1, or we couldn't read the site. Check the city's page before you plan around a date.

| City | Status on October 1 | Check |
|---|---|---|
| Des Moines | Not announced. The latest city notice is about 2025. | [dsm.city news](https://www.dsm.city/newslist.php) |
| West Des Moines | Not confirmed. The city site didn't load for us. | [wdm.iowa.gov](https://www.wdm.iowa.gov/) |
| Clive | Not announced | [cityofclive.com](https://www.cityofclive.com/) |
| Pleasant Hill | Not announced | [pleasanthilliowa.org](https://www.pleasanthilliowa.org/) |
| Norwalk | Not announced. The latest city notice is about 2025. | [Norwalk news](https://www.norwalk.iowa.gov/newslist.php) |
| Bondurant | Not announced | [cityofbondurant.com](https://www.cityofbondurant.com/) |
| Indianola | Not announced | [indianolaiowa.gov](https://www.indianolaiowa.gov/) |
| Polk City | Not confirmed. The city site didn't load for us. | [polkcityia.gov](https://www.polkcityia.gov/) |
| Carlisle | Not announced | [carlisleiowa.org](https://www.carlisleiowa.org/) |

## What each city says

### Altoona

Trick-or-treat night is Saturday, October 31, 6-8 pm. Residents who want trick-or-treaters should turn their outdoor lights on, and those who don't should leave them off. The city asks drivers and pedestrians to take extra care during those hours.

### Ankeny

Trick-or-treat is Saturday, October 31, 6-8 pm. The city calls participation voluntary and asks households handing out treats to light up the front door area. Its page also asks drivers to watch for children and to take care entering and leaving driveways.

### Grimes

The city posted on October 1, 2026: trick or treat in Grimes is October 31 from 6 to 8 pm.

### Johnston

Community trick-or-treating is Saturday, October 31, 6-8 pm. Homes taking part should have their porch lights on.

### Urbandale

The city calendar says trick or treat (Beggar's Night) is observed 6-8 pm on Halloween, October 31.

### Waukee

Kids go door to door 6-8 pm on October 31, and the city's listing adds "rain, snow or clear skies".

### Windsor Heights

The city calendar lists Beggars' Night on Saturday, October 31, 6-8 pm.

## More Halloween in Des Moines

- [Haunted houses near Des Moines](/articles/haunted-houses-near-des-moines)
- [Pumpkin patches and apple orchards](/articles/best-pumpkin-patches-in-the-des-moines-area-your-complete-fall-guide)
- [Corn mazes near Des Moines](/articles/corn-mazes-near-des-moines)
- [October 2026 events in Des Moines](/events/october-2026)

## Sources

All fetched October 1, 2026.

- Altoona: [Trick-or-Treat Night](https://www.altoona-iowa.com/news_detail_T2_R326.php)
- Ankeny: [Trick-or-Treat calendar entry](https://www.ankenyiowa.gov/Calendar.aspx?EID=3568)
- Grimes: [Trick Or Treat October 31st](https://www.grimesiowa.gov/m/newsflash/Home/Detail/1519)
- Johnston: [Halloween Trick-or-Treat calendar entry](https://www.cityofjohnston.com/Calendar.aspx?EID=4147)
- Urbandale: [Halloween / Trick or Treat calendar entry](https://www.urbandale.org/Calendar.aspx?EID=4364)
- Waukee: [Trick or Treat Night calendar entry](https://www.waukee.org/Calendar.aspx?EID=9876)
- Windsor Heights: [Beggars' Night calendar entry](https://www.windsorheights.org/Calendar.aspx?EID=1551)
- City of Des Moines: [Metro Communities Select Halloween for Trick-or-Treating in 2025](https://www.dsm.city/news_detail_T21_R34.php) (December 19, 2024) and the [city news list](https://www.dsm.city/newslist.php)
- City of Norwalk: [news list](https://www.norwalk.iowa.gov/newslist.php)
$c$::text as content,
  'Seven Des Moines suburbs have set 2026 trick-or-treat for Saturday, October 31, 6 to 8 pm: Altoona, Ankeny, Grimes, Johnston, Urbandale, Waukee and Windsor Heights. Des Moines has not posted its 2026 hours yet. Times and links from each city''s own site.'::text as excerpt,
  'Trick-or-Treat Times 2026: Des Moines and Suburbs'::text as seo_title,
  '2026 trick-or-treat hours for Ankeny, Urbandale, Waukee, Johnston, Grimes, Altoona and Windsor Heights from each city''s site, plus who hasn''t announced.'::text as seo_description,
  array['trick or treat times des moines','trick or treat des moines 2026','beggars night des moines 2026','trick or treat ankeny','trick or treat urbandale','trick or treat waukee','trick or treat johnston','halloween des moines 2026']::text[] as seo_keywords,
  array['halloween','trick-or-treat','beggars night','october','family']::text[] as tags;

do $$
declare problem text;
begin
  select public.article_body_problem(content) into problem from seo048_trick;
  if problem is not null then
    raise exception 'article_body_not_publishable: %', problem;
  end if;
  if exists (select 1 from public.articles a join seo048_trick t using (slug)) then
    raise exception 'slug already exists';
  end if;
end $$;

set local session_replication_role = replica;

insert into public.articles (
  title, slug, content, excerpt, author_id, status, category, tags,
  seo_title, seo_description, seo_keywords, published_at, created_at, updated_at, word_count
)
select t.title, t.slug, t.content, t.excerpt,
  '60ff90c2-d66d-407c-ba18-4462188c9b7b', 'published', 'Events', t.tags,
  t.seo_title, t.seo_description, t.seo_keywords, now(), now(), now(),
  array_length(regexp_split_to_array(btrim(t.content), '\s+'), 1)
from seo048_trick t;

-- The sitemap-queue trigger was skipped by replica mode; enqueue by hand.
insert into public.sitemap_change_queue (content_type, content_id, action)
select 'article', id, 'upsert' from public.articles
where slug = 'trick-or-treat-times-des-moines-suburbs-october-2026';

set local session_replication_role = origin;

-- 2. Drafts (normal triggers; status draft, so no webhook) -------------------
insert into public.articles (
  title, slug, content, excerpt, author_id, status, category, tags,
  seo_title, seo_description, seo_keywords, created_at
)
select v.title, v.slug, v.content, v.excerpt,
  '60ff90c2-d66d-407c-ba18-4462188c9b7b', 'draft', v.category, v.tags,
  v.seo_title, v.seo_description, v.seo_keywords, now()
from (values
(
  'Holiday Lights in Des Moines (2026)',
  'holiday-lights-des-moines-2026',
  $c$[Draft: entries to be added before publishing. Fewer than five 2026 displays verified on October 1, 2026; see scripts/seo-048-seasonal-articles.sql for the gaps.]

**Updated October 1, 2026.** Every date, hour and price here comes from the organizer's own website as it read on that day.

## Dome for the Holidays (Des Moines Botanical Garden)

- **2026 dates:** select evenings, November 14, 2026, through January 3, 2027, 5 to 9 pm. Closed Thursday, November 26; Thursday, December 24; Friday, December 25; and Friday, January 1.
- **Price:** adults $18, youth (1-13) $13, under 1 free; members get $3 off each ticket.
- **Site:** [Dome for the Holidays](https://dmbotanicalgarden.com/dome-for-the-holidays/)

## Holiday Promenade (East Village)

- **2026 dates:** Friday evenings from 5 pm: Tree Lighting with Santa on November 20 (5-9 pm), Window Display Contest on November 27, Week 3 on December 4, Cozy Night with Movie at Wooly's on December 11 (5-8 pm) and Light Up the Night on December 18.
- **Site:** [East Village events](https://eastvillagedesmoines.com/events/)

## Sources

All fetched October 1, 2026.

- Des Moines Botanical Garden: [Dome for the Holidays](https://dmbotanicalgarden.com/dome-for-the-holidays/)
- Historic East Village: [events](https://eastvillagedesmoines.com/events/), [Tree Lighting with Santa](https://eastvillagedesmoines.com/event/holiday-promenade-tree-lighting-with-santa/)
$c$,
  'Holiday light displays in and around Des Moines for 2026 with dates, hours and prices from each organizer''s own site.',
  'Attractions',
  array['holiday lights','christmas lights','december','november','family'],
  'Holiday Lights in Des Moines 2026: Dates and Prices',
  'Holiday light displays near Des Moines for 2026 with dates, hours and prices from each organizer''s own site.',
  array['holiday lights des moines','christmas lights des moines','dome for the holidays','holiday promenade east village']
),
(
  'Ice Skating in Des Moines (2026-27 Season)',
  'ice-skating-des-moines-2026',
  $c$[Draft: entries to be added before publishing. No rink had posted 2026-27 dates on October 1, 2026; see scripts/seo-048-seasonal-articles.sql for the gaps.]

**Updated October 1, 2026.** Prices and hours come from each rink's own website as it read on that day.

## Brenton Skating Plaza (downtown Des Moines)

An outdoor rink on the Principal Riverwalk along the Des Moines River, run by Des Moines Parks and Recreation. The city's page says it's open November to March; it had not posted a 2026 opening date.

- **Admission:** adult (13+) $12, or $10 with the Des Moines resident discount; child (6-12) and senior (60+) $8 ($6); 5 and under $3 ($2).
- **Skate rental:** $6 a pair ($5).
- **Punch pass:** 10 admissions with rentals, $115 ($95). Group pass for four skaters the same day, $30 ($25).
- **Weather:** at 55-59 degrees it opens at sundown; at 60-65 it closes for the day. It also closes for the day when temperatures under 5 degrees or a wind chill below zero are forecast for most of the open hours. Text BRENTONSKATING to 84483 for closure alerts.
- **Site:** [Brenton Skating Plaza](https://www.dsm.city/departments/parks_recreation/brenton_skating_plaza/index.php)

## Sources

All fetched October 1, 2026.

- City of Des Moines: [Brenton Skating Plaza](https://www.dsm.city/departments/parks_recreation/brenton_skating_plaza/index.php)
$c$,
  'Where to ice skate in and around Des Moines this winter, with prices and hours from each rink''s own site.',
  'Attractions',
  array['ice skating','winter','family','december'],
  'Ice Skating in Des Moines 2026-27: Rinks and Prices',
  'Ice skating rinks in and around Des Moines for the 2026-27 season with prices and hours from each rink''s own site.',
  array['ice skating des moines','brenton skating plaza','ice rinks des moines','outdoor ice skating des moines']
),
(
  'Thanksgiving Dinner Out in Des Moines (2026)',
  'thanksgiving-dinner-out-des-moines-2026',
  $c$[Draft: entries to be added before publishing. No restaurant had posted a 2026 Thanksgiving menu or hours on October 1, 2026; see scripts/seo-048-seasonal-articles.sql.]

**Updated October 1, 2026.** Thanksgiving is Thursday, November 26, 2026. Every menu, hour and price on this page will come from the restaurant's own site.
$c$,
  'Des Moines restaurants open on Thanksgiving 2026, with menus, hours and prices from each restaurant''s own site.',
  'Food & Drink',
  array['thanksgiving','restaurants','november','holiday dining'],
  'Thanksgiving Dinner Out in Des Moines 2026',
  'Des Moines restaurants serving Thanksgiving dinner on November 26, 2026, with menus, hours and prices from each restaurant''s own site.',
  array['thanksgiving dinner des moines','restaurants open thanksgiving des moines','thanksgiving buffet des moines']
),
(
  'Small Business Saturday in Valley Junction and the East Village (2026)',
  'small-business-saturday-valley-junction-east-village-2026',
  $c$[Draft: entries to be added before publishing. Neither district had posted 2026 Small Business Saturday plans on October 1, 2026; see scripts/seo-048-seasonal-articles.sql.]

**Updated October 1, 2026.** Small Business Saturday falls on November 28, 2026, the Saturday after Thanksgiving.

## East Village

The East Village lists its Holiday Promenade Window Display Contest on Friday, November 27, from 5 pm, the night before. [East Village events](https://eastvillagedesmoines.com/events/)

## Valley Junction

No 2026 holiday shopping event posted yet. [valleyjunction.com](https://valleyjunction.com/)

## Sources

All fetched October 1, 2026.

- Historic East Village: [events](https://eastvillagedesmoines.com/events/)
- Historic Valley Junction: [home](https://valleyjunction.com/)
$c$,
  'Small Business Saturday 2026 in Historic Valley Junction and the East Village: deals, events and hours from each district''s own site.',
  'Shopping',
  array['small business saturday','shopping','valley junction','east village','november'],
  'Small Business Saturday 2026: Valley Junction, East Village',
  'Small Business Saturday on November 28, 2026 in Valley Junction and the East Village, with events and hours from each district''s own site.',
  array['small business saturday des moines','valley junction small business saturday','east village des moines shopping','shop small des moines']
)
) as v(title, slug, content, excerpt, category, tags, seo_title, seo_description, seo_keywords);

select left(slug, 60) as slug, status, word_count, published_at, updated_at,
       public.article_body_problem(content) as body_problem
from public.articles
where slug in ('trick-or-treat-times-des-moines-suburbs-october-2026',
               'holiday-lights-des-moines-2026', 'ice-skating-des-moines-2026',
               'thanksgiving-dinner-out-des-moines-2026',
               'small-business-saturday-valley-junction-east-village-2026');

commit;
