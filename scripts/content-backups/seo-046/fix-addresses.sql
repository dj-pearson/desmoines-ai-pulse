-- SEO-046, second pass: addresses that read "Not provided in content".
--
-- Applied 2026-10-01 with psql, after fill-visit-facts.sql. Before-values are
-- in attractions-before.json. The detail page prints attractions.location as
-- the address and EnhancedAttractionSEO publishes it as streetAddress, so five
-- pages told visitors and crawlers the address was "Not provided in content".
-- Each replacement is the address the attraction's own page states, fetched
-- this session (2026-10-01). Coordinates are untouched (the only trigger on
-- this table that reads location-ish data, sync_geom_from_latlng, reads
-- latitude/longitude).
--
-- slug                       old                       new                                            evidence
-- blank-park-zoo             Not provided in content   7401 SW 9th Street, Des Moines, IA 50315       https://www.blankparkzoo.com/faq footer: "7401 SW 9th Street Des Moines, IA 50315"
-- science-center-of-iowa     Not provided in content   401 W. Martin Luther King Jr. Parkway, Des Moines   https://www.sciowa.org/visit/planning-your-visit/directions-and-parking/ : "Downtown Des Moines at 401 W. Martin Luther King Jr. Parkway"
-- adventureland-resort       Not provided in content   3200 Adventureland Drive, Altoona, IA 50009    https://www.adventurelandpark.com/plan-your-visit/directions-parking/ : "3200 Adventureland Drive Altoona, IA 50009"
-- gray-s-lake                Not provided in content   2101 Fleur Dr, Des Moines, IA 50321            https://www.dsm.city/Gray_s_Lake_Park514.php : "2101 Fleur Dr, Des Moines, IA 50321"
-- pappajohn-sculpture-park   Downtown Des Moines       1330 Grand Avenue, Des Moines                  https://desmoinesartcenter.org/visit/pappajohn-sculpture-park/ : "located at 1330 Grand Avenue in downtown Des Moines"
-- high-trestle-trail         Not provided in content   NULL                                           a 25-mile trail, Woodward to Ankeny (INHF page); no single street address, so none is published
--
-- Not changed: iowa-state-capitol "Downtown Des Moines" (the legis.iowa.gov
-- page gives no street address). Open: pappajohn-sculpture-park and
-- iowa-state-capitol sit on 41.5868,-93.625, the downtown fallback point, not
-- their own coordinates.

BEGIN;
UPDATE public.attractions SET location = '7401 SW 9th Street, Des Moines, IA 50315' WHERE slug = 'blank-park-zoo' AND location = 'Not provided in content';
UPDATE public.attractions SET location = '401 W. Martin Luther King Jr. Parkway, Des Moines' WHERE slug = 'science-center-of-iowa' AND location = 'Not provided in content';
UPDATE public.attractions SET location = '3200 Adventureland Drive, Altoona, IA 50009' WHERE slug = 'adventureland-resort' AND location = 'Not provided in content';
UPDATE public.attractions SET location = '2101 Fleur Dr, Des Moines, IA 50321' WHERE slug = 'gray-s-lake' AND location = 'Not provided in content';
UPDATE public.attractions SET location = '1330 Grand Avenue, Des Moines' WHERE slug = 'pappajohn-sculpture-park' AND location = 'Downtown Des Moines';
UPDATE public.attractions SET location = NULL WHERE slug = 'high-trestle-trail' AND location = 'Not provided in content';
COMMIT;
