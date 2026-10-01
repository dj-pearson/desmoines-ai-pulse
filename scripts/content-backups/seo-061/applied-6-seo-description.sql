-- SEO-061 step 2 follow-up: seo_description on the re-tagged rows said "an American
-- restaurant". Rewritten with restaurantTemplateDescription (src/lib/restaurantMeta.ts)
-- from the corrected row; check-restaurant-seo flagged two of them. Old values are in
-- restaurants-before.json.
begin;
update public.restaurants set seo_description = 'Cowboy Mexican Bar & Grill is a Mexican restaurant at 1234 E Euclid Ave in Des Moines, Iowa. $ on Google. Menu, phone, map and directions.' where slug = 'cowboy-mexican-bar-grill';
update public.restaurants set seo_description = 'El Gran Amigo Mexican Food is a Mexican restaurant at 705 Greene St in Adel, Iowa. $$ on Google. Phone, map and directions.' where slug = 'el-gran-amigo-mexican-food';
update public.restaurants set seo_description = 'Jethro''s BBQ is a BBQ restaurant at 721 3rd St in Des Moines, Iowa. $ on Google. Phone, map and directions.' where slug = 'jethros-bbq';
update public.restaurants set seo_description = 'Jethro''s BBQ ''n Bacon Bacon is a BBQ restaurant at 1480 22nd St in West Des Moines, Iowa. $ on Google. Phone, map and directions.' where slug = 'jethros-bbq-n-bacon-bacon';
update public.restaurants set seo_description = 'Jethro''s BBQ n'' LakeHouse is a BBQ restaurant at 1425 SW Vintage Pkwy in Ankeny, Iowa. $ on Google. Phone, map and directions.' where slug = 'jethros-bbq-n-lakehouse';
update public.restaurants set seo_description = 'Taqueria tacos la palma is a Mexican restaurant at 715 Ferry St in Adel, Iowa. $$ on Google. Phone, map and directions.' where slug = 'taqueria-tacos-la-palma';
update public.restaurants set seo_description = 'The Breakfast Club is a Breakfast & Brunch restaurant at 212 E 3rd St Ste B in Des Moines, Iowa. $ on Google. Phone, map and directions.' where slug = 'the-breakfast-club';
update public.restaurants set seo_description = 'Wasabi West Des Moines is a Sushi & Asian Fusion restaurant at 5045 Bentley Dr #140 in West Des Moines, Iowa. $ on Google. Phone, map and directions.' where slug = 'wasabi-west-des-moines';
commit;
