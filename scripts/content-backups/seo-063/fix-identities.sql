-- SEO-063 steps 2 and 3: restaurant rows carrying another business's identity,
-- and an indoor playground listed as a restaurant. Backup of every row before
-- any write: restaurants-before.json (same folder).
--
-- Evidence, fetched 2026-10-01 this session (WebFetch / curl):
--   bar-martinez  https://www.barmartinezdsm.com/ : "515 Euclid Ave. Des Moines, IA",
--     "Hours of Operation Wednesday - Sunday 5pm - 1am", "Serving Food Late",
--     "Closed on Mondays & Tuesdays", info@barmartinezdsm.com. No phone on
--     the site. The row's 428 E Locust St, (515) 243-0611, barnicodsm.com,
--     rating, price and Google place id are Bar Nico's (bar-nico row, same
--     address). The site names no cuisine, so "Mexican" (Bar Nico's) goes too.
--   littleleaf-luncheonette  https://www.littleleafluncheonette.com/ :
--     "405 6th Street, Waukee, Iowa", 515-777-7171, "a modern luncheonette",
--     breakfast, brunch, lunch, shared plates, coffee, smoothies, craft wine
--     and beer, menu "shifts with the seasons". The row's 32513 Ute Ave,
--     (515) 987-3561 and ltorganicfarm.org are LT Organic Farm's.
--   moes-southwest-grill  https://locations.moes.com/ia/urbandale :
--     "4206 Merle Hay Road", Urbandale, 50310, (515) 337-9337. Row had only
--     "Des Moines metro, IA".
--   taste-of-new-york-pleasant-hill  http://www.tasteofnypizza.com/ : Waukee
--     store "769 Southeast Alices Road, Waukee, IA 50263", Mon-Sat 11-9 (the
--     row's address). The Pleasant Hill store is The Pizza Bar, already its
--     own row (pizza-bar-by-taste-of-new-york). Row coordinates
--     41.6011,-93.5244 were Pleasant Hill's; renamed to
--     taste-of-new-york-waukee, 301 in public/_redirects.
--   empire  https://www.kidsempire.com/park/merle-hay (SEO-062): Kids Empire,
--     an indoor playground. playgrounds already holds it as
--     kids-empire-merle-hay (same 3800 Merle Hay Rd), so nothing is added
--     there. The restaurant row is hidden the way SEO-062 hid
--     daves-hot-chicken-2 (is_merged, no target, blacklisted not_restaurant),
--     and /restaurants/empire 301s to /playgrounds/kids-empire-merle-hay.
--
-- Coordinates: the repo's geocoder (geocode-location edge function, Nominatim)
-- returned "No coordinates found" for all four addresses, so they come from
-- the US Census geocoder (geocoding.geo.census.gov onelineaddress,
-- Public_AR_Current), which matched each address exactly:
--   515 EUCLID AVE, DES MOINES, IA, 50313      41.62774,-93.62377
--   405 6TH ST, WAUKEE, IA, 50263              41.61137,-93.88551
--   4206 MERLE HAY RD, DES MOINES, IA, 50310   41.63675,-93.69788 (postal city; Moe's says Urbandale)
--   769 ALICES RD, WAUKEE, IA, 50263           41.60546,-93.85285
-- neighborhood: none of the four falls in a src/lib/neighborhoodBoundaries.ts
-- polygon, so it is NULL (bar-martinez had east-village from Bar Nico's point).
--
-- google_place_id / places_photo_* are cleared on bar-martinez and
-- littleleaf-luncheonette: they resolve to the other business, and
-- bulk-update-restaurants copies phone and website from the place id, so
-- keeping them would put Bar Nico's and the farm's details straight back.
-- ai_writeup is cleared on bar-martinez, littleleaf-luncheonette and
-- taste-of-new-york (they describe the other business or the other town).
-- seo_title / seo_description are regenerated afterwards by
-- scripts/backfill-restaurant-seo.ts from the corrected rows.

begin;

update public.restaurants
   set location = '515 Euclid Ave, Des Moines, IA 50313, USA',
       city = 'Des Moines',
       latitude = 41.62774, longitude = -93.62377,
       neighborhood = null,
       phone = null,
       website = 'https://www.barmartinezdsm.com/',
       cuisine = 'Bar',
       rating = null,
       price_range = null,
       google_place_id = null,
       google_maps_uri = null,
       places_photo_name = null,
       places_photo_attribution = null,
       places_photo_seen_at = null,
       ai_writeup = null,
       seo_h1 = 'Bar Martinez in Des Moines',
       seo_description = null,
       seo_keywords = array['Bar Martinez', 'Bar Martinez Des Moines', 'bar Euclid Ave Des Moines', 'late night food Des Moines'],
       geo_summary = 'Bar Martinez is a bar at 515 Euclid Ave in Des Moines, Iowa. It is open Wednesday through Sunday from 5pm to 1am, serves food late, and is closed Mondays and Tuesdays.',
       geo_faq = jsonb_build_array(
         jsonb_build_object('question', 'What is Bar Martinez?',
           'answer', 'Bar Martinez is a bar in Des Moines that serves food late.'),
         jsonb_build_object('question', 'Where is Bar Martinez located?',
           'answer', 'Bar Martinez is at 515 Euclid Ave, Des Moines, IA 50313.'),
         jsonb_build_object('question', 'When is Bar Martinez open?',
           'answer', 'Wednesday through Sunday, 5pm to 1am. It is closed Mondays and Tuesdays.')),
       geo_key_facts = array['Located at 515 Euclid Ave, Des Moines',
                             'Open Wednesday - Sunday, 5pm - 1am',
                             'Serves food late',
                             'Closed Mondays and Tuesdays']
 where slug = 'bar-martinez'
   and location like '428 E Locust St%';

update public.restaurants
   set location = '405 6th St, Waukee, IA 50263, USA',
       city = 'Waukee',
       latitude = 41.61137, longitude = -93.88551,
       neighborhood = null,
       phone = '(515) 777-7171',
       website = 'https://www.littleleafluncheonette.com/',
       rating = null,
       price_range = null,
       google_place_id = null,
       google_maps_uri = null,
       places_photo_name = null,
       places_photo_attribution = null,
       places_photo_seen_at = null,
       ai_writeup = null,
       seo_h1 = 'Littleleaf Luncheonette in Waukee',
       seo_description = null,
       seo_keywords = array['Littleleaf Luncheonette', 'Littleleaf Luncheonette Waukee', 'brunch Waukee', 'breakfast Waukee'],
       geo_summary = 'Littleleaf Luncheonette is a modern luncheonette at 405 6th Street in Waukee, Iowa, serving breakfast, brunch, lunch and shared plates, plus coffee, smoothies, craft wine and beer. Its menu shifts with the seasons.',
       geo_faq = jsonb_build_array(
         jsonb_build_object('question', 'What does Littleleaf Luncheonette serve?',
           'answer', 'Breakfast, brunch, lunch and shared plates, plus coffee, smoothies, craft wine and beer. The menu shifts with the seasons.'),
         jsonb_build_object('question', 'Where is Littleleaf Luncheonette located?',
           'answer', 'Littleleaf Luncheonette is at 405 6th Street in Waukee, Iowa.'),
         jsonb_build_object('question', 'What is the phone number for Littleleaf Luncheonette?',
           'answer', '515-777-7171.')),
       geo_key_facts = array['Located at 405 6th Street, Waukee',
                             'Breakfast, brunch, lunch and shared plates',
                             'Coffee, smoothies, craft wine and beer',
                             'Seasonal menu']
 where slug = 'littleleaf-luncheonette'
   and location like '32513 Ute Ave%';

-- Moe's: identity plus the stale opening copy found in step 1.
update public.restaurants
   set location = '4206 Merle Hay Rd, Urbandale, IA 50310, USA',
       city = 'Urbandale',
       latitude = 41.63675, longitude = -93.69788,
       neighborhood = null,
       phone = '(515) 337-9337',
       website = 'https://locations.moes.com/ia/urbandale',
       seo_h1 = 'Moe''s Southwest Grill in Urbandale',
       seo_description = null,
       description = 'Moe''s Southwest Grill at 4206 Merle Hay Rd in Urbandale, serving Mexican and Southwestern food.',
       geo_summary = 'Moe''s Southwest Grill serves Mexican and Southwestern cuisine at 4206 Merle Hay Rd in Urbandale, in the Des Moines metro area.',
       geo_faq = (
         select jsonb_agg(
                  case when e->>'question' = 'Where is Moe''s Southwest Grill located?'
                       then jsonb_build_object(
                              'question', e->>'question',
                              'answer', 'Moe''s Southwest Grill is at 4206 Merle Hay Rd, Urbandale, IA 50310, in the Des Moines metro area.')
                       else e end
                  order by o)
           from jsonb_array_elements(geo_faq) with ordinality as t(e, o)),
       geo_key_facts = array['Located at 4206 Merle Hay Rd, Urbandale',
                             'Specializes in Mexican and Southwestern cuisine',
                             'Budget-friendly dining option with $ price range']
 where slug = 'moes-southwest-grill'
   and location = 'Des Moines metro, IA';

update public.restaurants
   set name = 'Taste of New York - Waukee',
       slug = 'taste-of-new-york-waukee',
       city = 'Waukee',
       latitude = 41.60546, longitude = -93.85285,
       neighborhood = null,
       ai_writeup = null,
       seo_title = null,
       seo_description = null,
       seo_keywords = array_replace(seo_keywords, 'Italian restaurants Pleasant Hill', 'Italian restaurants Waukee')
 where slug = 'taste-of-new-york-pleasant-hill'
   and location like '769 SE Alice''s Rd, Waukee%';

-- empire (Kids Empire): out of every restaurant list, the sitemap and re-import.
update public.restaurants
   set is_merged = true,
       merged_at = now()
 where slug = 'empire'
   and website like 'https://www.kidsempire.com/%'
   and merged_into is null;

insert into public.restaurant_blacklist
  (google_place_id, restaurant_name, reason, reason_category, formatted_address)
select r.google_place_id,
       r.name,
       'SEO-063: Kids Empire Merle Hay is an indoor playground (playgrounds row kids-empire-merle-hay)',
       'not_restaurant',
       r.location
  from public.restaurants r
 where r.slug = 'empire'
   and not exists (
     select 1 from public.restaurant_blacklist b
      where b.google_place_id = r.google_place_id
   );

commit;
