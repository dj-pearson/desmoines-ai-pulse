-- SEO-063: seo_title / seo_description for the four corrected rows, the values
-- `npx tsx scripts/backfill-restaurant-seo.ts` (dry run, 2026-10-01) computed
-- from the rows after fix-identities.sql. Applied for these four only: the
-- same dry run also wanted to change the-cheesecake-factory, the-toasted-cone
-- and toasted-cone, which are outside this story.

begin;

update public.restaurants
   set seo_description = 'Bar Martinez is a Bar spot at 515 Euclid Ave in Des Moines, Iowa. Map and directions.'
 where slug = 'bar-martinez' and seo_description is null;

update public.restaurants
   set seo_description = 'Littleleaf Luncheonette is an American restaurant at 405 6th St in Waukee, Iowa. Phone, map and directions.'
 where slug = 'littleleaf-luncheonette' and seo_description is null;

update public.restaurants
   set seo_title = 'Moe''s Southwest Grill Urbandale: Photos & Reviews',
       seo_description = 'Moe''s Southwest Grill is a Mexican/Southwestern restaurant at 4206 Merle Hay Rd in Urbandale, Iowa. $ on Google. Phone, map and directions.'
 where slug = 'moes-southwest-grill' and seo_description is null;

update public.restaurants
   set seo_title = 'Taste of New York - Waukee: Menu, Photos & Reviews',
       seo_description = 'Taste of New York - Waukee is an Italian restaurant at 769 SE Alice''s Rd in Waukee, Iowa. $ on Google. Menu, phone, map and directions.'
 where slug = 'taste-of-new-york-waukee' and seo_description is null;

commit;

-- check-restaurant-seo then still failed two rows outside the story
-- (description [no-cuisine]): their cuisine had been corrected from Bakery
-- but seo_description still said "a Bakery spot". Set to the template value
-- the same dry run computed. Old values: seo-description-before.json.

begin;

update public.restaurants
   set seo_description = 'The Cheesecake Factory is an American, Brunch restaurant at 101 Jordan Creek Pkwy in West Des Moines, Iowa. $ on Google. Phone, map and directions.'
 where slug = 'the-cheesecake-factory' and seo_description like '%is a Bakery spot%';

update public.restaurants
   set seo_description = 'The Toasted Cone is an Ice Cream spot at 9500 University Ave Suite 2105 in West Des Moines, Iowa. $$ on Google. Phone, map and directions.'
 where slug = 'the-toasted-cone' and seo_description like '%is a Bakery spot%';

commit;
