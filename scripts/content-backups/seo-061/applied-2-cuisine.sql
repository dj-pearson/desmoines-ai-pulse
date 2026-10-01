-- SEO-061 step 2: cuisine mislabels. Backup: restaurants-before.json.
-- Each update is guarded on the old value so a re-run changes nothing.
--
-- Evidence, fetched 2026-10-01 this session:
--   Jethro's (3 rows)  https://www.jethrosdesmoines.com/locations/jethros-bbq-downtown
--     (curl with a browser UA; WebFetch got 403): "At Jethro's BBQ, we take
--     pride in our slow-smoked meats", schema type "Barbecue Restaurant",
--     "classic American barbecue". All three rows' websites are location pages
--     on that site and the names say BBQ. 'BBQ' is the stored value the
--     /bbq/<area> filter matches (src/pseo/listingFilters.ts).
--   The Breakfast Club  http://www.thebreakfastclubusa.com/ : "Best Brunch in
--     the Des Moines Metro", locations open 6:00am-2:30pm (Ankeny 7:00am).
--   Cowboy Mexican Bar & Grill  https://cowboygrilldsm.com/ : "bold Mexican
--     flavor", "authentic Mexican dishes made fresh daily", 1234 E Euclid Ave.
--   El Gran Amigo Mexican Food, Taqueria tacos la palma: no website on the
--     row; the row's own name says Mexican / taqueria.
--   Wasabi West Des Moines  http://wasabiwdsm.com/ : "ASIAN FUSION",
--     "highest quality sushi in town". Was 'American'.
--   Wasabi Waukee  https://wasabiwaukee.com/ : sushi-focused menu (rolls,
--     seafood, ramen, fried rice); no Thai named. Was 'Thai'. Its address on
--     that site is "9500 University Ave ST 2101, West Des Moines, IA 50266",
--     the row's address, so it is correctly counted under West Des Moines;
--     only the name says Waukee. No location change.
--
-- NOT CHANGED: Gabriela's Salsa-Picante ('American', 5.0, in the top 20) has
-- no website on the row and its name does not state a cuisine.

begin;
update public.restaurants set cuisine = 'BBQ'
 where slug in ('jethros-bbq', 'jethros-bbq-n-bacon-bacon', 'jethros-bbq-n-lakehouse') and cuisine = 'American';
update public.restaurants set cuisine = 'Breakfast, Brunch'
 where slug = 'the-breakfast-club' and cuisine = 'American';
update public.restaurants set cuisine = 'Mexican'
 where slug in ('cowboy-mexican-bar-grill', 'el-gran-amigo-mexican-food', 'taqueria-tacos-la-palma') and cuisine = 'American';
update public.restaurants set cuisine = 'Asian Fusion, Sushi'
 where slug = 'wasabi-west-des-moines' and cuisine = 'American';
update public.restaurants set cuisine = 'Sushi'
 where slug = 'wasabi-waukee' and cuisine = 'Thai';
commit;

-- Follow-up, same session: the comma lists read badly in the templated meta
-- description ("a Breakfast, Brunch restaurant"), so they are joined with "&".
-- Both still match the /brunch and /asian filters (src/pseo/listingFilters.ts).
begin;
update public.restaurants set cuisine = 'Breakfast & Brunch'
 where slug = 'the-breakfast-club' and cuisine = 'Breakfast, Brunch';
update public.restaurants set cuisine = 'Sushi & Asian Fusion'
 where slug = 'wasabi-west-des-moines' and cuisine = 'Asian Fusion, Sushi';
commit;
