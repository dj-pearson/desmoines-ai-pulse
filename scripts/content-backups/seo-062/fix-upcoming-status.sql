-- SEO-062: restaurants marked opening_soon/announced that are open.
--
-- Applied 2026-10-01 against production with psql. Backup of all 22 rows as
-- they stood before this ran: restaurants-before.json (same folder).
-- Restore any row from that file; nothing here deletes data.
--
-- Status values allowed by restaurants_status_check: open, opening_soon,
-- newly_opened, announced, closed. newly_opened is not used: the code only
-- treats a place as new when opening_date falls in the last 60 days
-- (src/lib/restaurantOpenings.ts isNewlyOpened), and none of these rows has a
-- confirmed opening date inside that window. On the detail page newly_opened
-- and open render the same (RestaurantDetails.tsx lifecycleOf).
--
-- Evidence, fetched 2026-10-01 (WebFetch/curl this session). "Stored Google"
-- means restaurants.business_status as already stored; Places was NOT called.
--
-- slug                            old            new        evidence
-- atlas-caf                       opening_soon   open       stored Google business_status OPERATIONAL, stored hours_json and phone; no website on the row (atlascafe.com is an unrelated empty page)
-- bar-martinez                    opening_soon   open       https://www.barmartinezdsm.com/ : "Wednesday - Sunday 5pm - 1am", 515 Euclid Ave. ROW ADDRESS/WEBSITE ARE WRONG (428 E Locust / barnicodsm.com is Bar Nico) - follow-up
-- bonchon                         opening_soon   open       https://restaurants.bonchon.com/locations/IA/west-des-moines : 6880 EP True Pkwy listed with "Directions & Hours" and "Order Now"
-- bubbies-pleasant-hill           announced      open       https://bubbies-bbq.com/ : Pleasant Hill, 1225 Copper Creek Dr Suite E1, Tue-Sun lunch 11-2:30, dinner 4-8
-- canopy                          announced      open       stored Google business_status OPERATIONAL; https://www.oakparkdsm.com/ (row website, same 3901 Ingersoll address) "Tuesday - Saturday, Open at 4:30pm"; timeframe "September 2026" has passed
-- chikin-likin                    opening_soon   open       http://www.eatlocalbites.com/ (Local Bites, 700 Locust): "Chickin Lickin - NOW OPEN"
-- daves-hot-chicken-2             opening_soon   open + hidden   https://restaurants.daveshotchicken.com/ia/davenport/spicy-chicken-sandwich-east-53rd-street/ : open daily from 11am, 3022 E 53rd St, Davenport. Out of the Des Moines area: see block below
-- empire                          opening_soon   open       https://www.kidsempire.com/park/merle-hay : open Mon-Thu 10-8, Fri-Sun 10-10. NOT A RESTAURANT (indoor playground) - follow-up
-- highland-underground            opening_soon   open       https://highlandunderground.com : Tue-Thu 3-10, Fri 3-12, Sat 12-12, Sun 12-10
-- judges-dsm                      opening_soon   open       https://www.judgesdsm.com/ : "Tue, Wed, Thur 11:00 AM - 9:00 PM", Fri, Sat hours, online ordering
-- les-chinese-bar-b-que           opening_soon   open       https://leschinesebbq.com/ : 2831 Douglas Ave, "Mon.-Sun. 11am-6pm", online ordering
-- littleleaf-luncheonette         opening_soon   open       https://www.littleleafluncheonette.com/ : "NOW OPEN", 405 6th Street, Waukee. ROW ADDRESS/PHONE/WEBSITE ARE LT ORGANIC FARM's (32513 Ute Ave) - follow-up
-- moes-southwest-grill            opening_soon   open       https://locations.moes.com/ia/urbandale : 4206 Merle Hay Rd, Urbandale, published hours 10:30-22:00 daily, no coming-soon flag. Row location is only "Des Moines metro, IA" - follow-up
-- taste-of-new-york-pleasant-hill announced      open       http://www.tasteofnypizza.com/ : Waukee, 769 SE Alices Rd, Mon-Sat 11-9 (the row's address). Name says Pleasant Hill - follow-up
-- wayback-burgers                 announced      open       https://waybackburgers.com/locations/ : 1165 Southeast Alice's Road, Waukee, "Today's Hours: 10:30 AM - 09:00 PM"
--
-- Left unchanged, with evidence that they are not open:
-- kura-revolving-sushi-bar        announced      announced  https://kurasushi.com/locations : "IOWA (0) locations"; row timeframe 2027
-- san-miguel-eatery               announced      announced  https://sanmigueleatery.com/ : "We're under construction"; instagram.com/sanmiguel.eatery bio "COMING SOON!"
--
-- Left unchanged, no evidence either way (flagged by scripts/check-stale-openings.mjs where stale):
-- dutch-bros-coffee               announced      https://www.dutchbros.com/locations/ia : 3 Iowa stores (Ankeny; Des Moines = 4800 SE 14th St; WDM = 5950 Mills Civic Pkwy). 1534 E Grand Ave is not among them, open or coming soon
-- jungle-tea                      opening_soon   no website on the row; jungletea.com is a parked domain. opening_date 2026-05-15 has passed
-- marvs-mainstreet-dive           opening_soon   no website on the row; no official site found. opening_date 2026-03-31 has passed
-- the-ingersoll                   opening_soon   https://www.theingersoll.com/ : address only, no hours or opening status on the page
-- yard-house                      announced      https://www.yardhouse.com/locations/ia/west-des-moines returns a bot-blocked page; row timeframe April 2027
--
-- daves-hot-chicken-2: the only Dave's Hot Chicken row, so there is nothing in
-- Des Moines to 301 to. The site's existing way to take a row out of every
-- list without deleting it is is_merged: every list hook and the restaurant
-- sitemap filter neq('is_merged', true), and the edge shell serves a merged
-- row with no merge target as "noindex, follow"
-- (functions/_middleware.ts restaurantShellRobots). restaurant_blacklist
-- (out_of_scope) stops search-new-restaurants re-importing it.

begin;

update public.restaurants
   set status = 'open'
 where status in ('opening_soon', 'announced')
   and slug in (
     'atlas-caf',
     'bar-martinez',
     'bonchon',
     'bubbies-pleasant-hill',
     'canopy',
     'chikin-likin',
     'daves-hot-chicken-2',
     'empire',
     'highland-underground',
     'judges-dsm',
     'les-chinese-bar-b-que',
     'littleleaf-luncheonette',
     'moes-southwest-grill',
     'taste-of-new-york-pleasant-hill',
     'wayback-burgers'
   );

update public.restaurants
   set is_merged = true,
       merged_at = now()
 where slug = 'daves-hot-chicken-2'
   and location ilike '%Davenport, IA%'
   and merged_into is null;

insert into public.restaurant_blacklist
  (google_place_id, restaurant_name, reason, reason_category, formatted_address)
select r.google_place_id,
       r.name,
       'SEO-062: Davenport location, outside the Des Moines area',
       'out_of_scope',
       r.location
  from public.restaurants r
 where r.slug = 'daves-hot-chicken-2'
   and not exists (
     select 1 from public.restaurant_blacklist b
      where b.google_place_id = r.google_place_id
   );

commit;
