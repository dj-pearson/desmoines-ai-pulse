-- SEO-063 step 1: open restaurants whose stored copy still says they have not
-- opened. Backup of every row this story touches, taken before any write:
-- restaurants-before.json (same folder).
--
-- Scan (2026-10-01): status in (open, newly_opened), not merged, description /
-- geo_summary / geo_faq / seo_description / geo_key_facts matching
-- opening soon | coming soon | will open | opens in | set to open |
-- hasn't opened, widened to upcoming | is opening | will be located |
-- opening in | is bringing | will offer | will serve.
-- Hits: atlas-caf, bonchon, highland-underground, les-chinese-bar-b-que,
-- mee-mochi-donuts-soft-serve, moes-southwest-grill, el-fogon,
-- bandit-burrito (ai_writeup only).
--   el-fogon: "Blanca Plascencia, who is opening San Miguel Eatery" is about
--     another business that is still announced (SEO-062). True; left alone.
--   bandit-burrito: "pickup service coming soon" in ai_writeup, not about
--     opening. Left alone.
--   moes-southwest-grill: rewritten with its identity fix
--     (fix-identities.sql), since the corrected address goes into the copy.
--
-- Rewrites use only facts already on the row (name, address, status). Only the
-- offending sentence or list item changes; every other sentence is kept.
-- Each update is guarded on the old text, so a re-run is a no-op.

begin;

-- atlas-caf
update public.restaurants
   set geo_summary = replace(geo_summary, 'coffee shop opening soon at The Meridian', 'coffee shop at The Meridian'),
       geo_faq = (
         select jsonb_agg(
                  case when e->>'question' = 'When is Atlas Café opening?'
                       then jsonb_build_object(
                              'question', 'Is Atlas Café open?',
                              'answer', 'Yes. Atlas Café is open at The Meridian, 7001 Westown Parkway, Suite 100, in West Des Moines. Check the hours on this page before you go.')
                       else e end
                  order by o)
           from jsonb_array_elements(geo_faq) with ordinality as t(e, o))
 where slug = 'atlas-caf'
   and geo_summary like '%coffee shop opening soon at The Meridian%';

-- bonchon
update public.restaurants
   set geo_summary = 'Bonchon, the Korean fried chicken chain, has its first Iowa location at 6880 EP True Pkwy Unit 104 in West Des Moines. Known for its signature double-fried Korean chicken with soy garlic and spicy glazes, Bonchon serves Korean cuisine in the Des Moines metro area.',
       geo_faq = (
         select jsonb_agg(
                  case
                    when e->>'question' = 'Where is Bonchon located in Des Moines?'
                      then jsonb_build_object(
                             'question', e->>'question',
                             'answer', 'Bonchon is at 6880 EP True Pkwy Unit 104 in West Des Moines, Iowa, the first location of this Korean fried chicken chain in the state.')
                    when e->>'question' = 'When is Bonchon opening in West Des Moines?'
                      then jsonb_build_object(
                             'question', 'Is Bonchon in West Des Moines open?',
                             'answer', 'Yes. Bonchon is open at 6880 EP True Pkwy Unit 104 in West Des Moines. Check its website for current hours.')
                    else e end
                  order by o)
           from jsonb_array_elements(geo_faq) with ordinality as t(e, o)),
       geo_key_facts = array_replace(
                         array_replace(geo_key_facts,
                           'First Bonchon location in Iowa opening in West Des Moines',
                           'First Bonchon location in Iowa, in West Des Moines'),
                         'Opening soon in the Des Moines metro area',
                         'Open at 6880 EP True Pkwy Unit 104, West Des Moines')
 where slug = 'bonchon'
   and geo_summary like '%is opening its first Iowa location%';

-- highland-underground
update public.restaurants
   set geo_summary = 'Highland Underground is a cocktail bar and restaurant in Des Moines'' historic Highland Park neighborhood at 3610 5th Ave. It serves craft cocktails and food.'
 where slug = 'highland-underground'
   and geo_summary like 'Highland Underground is an upcoming cocktail bar%';

-- les-chinese-bar-b-que
update public.restaurants
   set geo_summary = replace(
                       replace(geo_summary,
                         'is a legendary Des Moines institution relocating to 2831 Douglas Ave',
                         'is a longtime Des Moines institution at 2831 Douglas Ave'),
                       'Opening March 2026, Le''s continues',
                       'Le''s continues'),
       geo_faq = (
         select jsonb_agg(
                  case when e->>'question' = 'When is Le''s Chinese Bar-B-Que opening?'
                       then jsonb_build_object(
                              'question', 'Is Le''s Chinese Bar-B-Que open?',
                              'answer', 'Yes. Le''s Chinese Bar-B-Que is open at its new location, 2831 Douglas Ave in Des Moines.')
                       else e end
                  order by o)
           from jsonb_array_elements(geo_faq) with ordinality as t(e, o)),
       geo_key_facts = array_replace(geo_key_facts,
                         'Opening March 31, 2026 - a longtime Des Moines institution returning to serve the community',
                         'A longtime Des Moines institution, now at 2831 Douglas Ave')
 where slug = 'les-chinese-bar-b-que'
   and geo_summary like '%relocating to 2831 Douglas Ave%';

-- mee-mochi-donuts-soft-serve
update public.restaurants
   set geo_summary = replace(
                       replace(geo_summary,
                         'is a specialty dessert shop opening in 2025 at 772 W. Hickman Road',
                         'is a specialty dessert shop at 772 W. Hickman Road'),
                       'The establishment will offer authentic',
                       'It offers authentic'),
       geo_key_facts = array_replace(geo_key_facts,
                         'Opening August 2025 in Waukee, Des Moines metro area',
                         'Located in Waukee, Des Moines metro area')
 where slug = 'mee-mochi-donuts-soft-serve'
   and geo_summary like '%dessert shop opening in 2025%';

commit;
