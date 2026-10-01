-- SEO-061 step 1: rows on a geocoder fallback coordinate, re-geocoded from the
-- stored street address. Backup of every row first: restaurants-before.json
-- (same folder).
--
-- The 23 rows scripts/assign-restaurant-neighborhoods.ts read as fallbacks sat
-- on five shared points. 41.5869,-93.6249 (9 rows, downtown) was a real
-- fallback: it carried an Ankeny address (Birdies), Court Ave, SW 3rd St,
-- E Grand Ave and five rows whose location is only "Des Moines, IA". The other
-- four points were buildings holding several suites (9250 University Ave,
-- 5500 Merle Hay Rd, 114 Brick St SE, 1225 Copper Creek Dr), flagged because
-- the suite numbers made the locations differ.
--
-- Geocoder: US Census onelineaddress, benchmark Public_AR_Current, run
-- 2026-10-01. Every one of the 18 rows with a street address returned exactly
-- one match on the same number and street. Where the first query (with the
-- suite) returned nothing, it was retried with the suite removed. Raw
-- responses: geocode-census-2026-10-01.json (same folder).
--
-- NOT MATCHED, left as they are (no street address on the row): el-fogon,
-- exile-brewing-co, motley-school-tavern, ritual-cafe, the-contrary. Their
-- location is "Des Moines, IA" and they stay on 41.5869,-93.6249, which the
-- assignment script still reads as a fallback (no neighbourhood).

begin;

update public.restaurants r
   set latitude = v.lat, longitude = v.lng
  from (values
  ('birdies-tavern-grill', 41.748045, -93.600240), -- 1975 N ANKENY BLVD, ANKENY, IA, 50023 (was the downtown point)
  ('blue-sushi-sake-grill', 41.585193, -93.620659), -- 316 COURT AVE, DES MOINES, IA, 50309
  ('blutaco', 41.689198, -93.463312), -- 114 BRICK ST SE, BONDURANT, IA, 50035
  ('brick-street-cafe-bondurant-ia', 41.689198, -93.463312), -- 114 BRICK ST SE, BONDURANT, IA, 50035
  ('brick-street-market-cafe', 41.689198, -93.463312), -- 114 BRICK ST SE, BONDURANT, IA, 50035
  ('bubbies-pleasant-hill', 41.601274, -93.524358), -- 1225 COPPER CREEK DR, PLEASANT HILL, IA, 50327
  ('dor-bakery', 41.581394, -93.619074), -- 340 SW 3RD ST, DES MOINES, IA, 50309
  ('dutch-bros-coffee', 41.594184, -93.594343), -- 1534 E GRAND AVE, DES MOINES, IA, 50316
  ('early-bird-west-des-moines', 41.600346, -93.836362), -- 9250 UNIVERSITY AVE, WEST DES MOINES, IA, 50266
  ('glck-tea', 41.600346, -93.836362), -- 9250 UNIVERSITY AVE, WEST DES MOINES, IA, 50266
  ('joes-pub', 41.660316, -93.697741), -- 5500 MERLE HAY RD, JOHNSTON, IA, 50131
  ('pizza-bar-by-taste-of-new-york', 41.601274, -93.524358), -- 1225 COPPER CREEK DR, PLEASANT HILL, IA, 50327
  ('shirleys-bar-grill', 41.600346, -93.836362), -- 9250 UNIVERSITY AVE, WEST DES MOINES, IA, 50266
  ('sushi-a-go-go', 41.660316, -93.697741), -- 5500 MERLE HAY RD, JOHNSTON, IA, 50131
  ('teriyaki-house-japanese-grill', 41.600346, -93.836362), -- 9250 UNIVERSITY AVE, WEST DES MOINES, IA, 50266
  ('the-pizza-bar', 41.601274, -93.524358), -- 1225 COPPER CREEK DR, PLEASANT HILL, IA, 50327
  ('what-dak-korean-fried-chicken', 41.600346, -93.836362), -- 9250 UNIVERSITY AVE, WEST DES MOINES, IA, 50266
  ('wongs-chopsticks', 41.660316, -93.697741) -- 5500 MERLE HAY RD, JOHNSTON, IA, 50131
  ) as v(slug, lat, lng)
 where r.slug = v.slug;

commit;
