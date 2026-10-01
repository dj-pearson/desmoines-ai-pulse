-- SEO-063 step 4: status for the five rows SEO-062 left unknown. Backup in
-- restaurants-before.json (same folder). WebSearch was unavailable this
-- session (the session's search budget was spent), so only pages that could be
-- fetched directly were used. Evidence fetched 2026-10-01:
--
-- the-ingersoll            opening_soon -> open
--   https://www.theingersoll.com/p/about/history : "When The Ingersoll reopened
--   in late 2025, it returns to its roots as a dinner theater and live
--   performance venue". https://www.theingersoll.com/p/plan-your-visit/faqs :
--   box office "Tuesday-Friday 12pm - 4pm CST", 515-377-0124, "Dinner seating
--   begins two hours prior to showtime". (/events lists no events today.)
--
-- Left unchanged, nothing fetchable settles them:
-- dutch-bros-coffee        announced. https://www.dutchbros.com/locations/ia
--   lists 3 Iowa stores; https://www.dutchbros.com/locations/ia/des-moines
--   lists only 4800 SE 14th St. 1534 E Grand Ave is on neither, open or
--   coming soon. Not proof it was cancelled.
-- jungle-tea               opening_soon, opening_date 2026-05-15. No website on
--   the row; jungletea.com is a 114-byte parked page. No search available.
-- marvs-mainstreet-dive    opening_soon, opening_date 2026-03-31. No website on
--   the row; marvsmainstreetdive.com does not resolve. No search available.
-- yard-house               announced, April 2027.
--   https://www.yardhouse.com/locations/ia/west-des-moines returns a bot
--   page to both WebFetch and curl. No search available.

begin;

update public.restaurants
   set status = 'open',
       phone = coalesce(nullif(phone, ''), '(515) 377-0124')
 where slug = 'the-ingersoll'
   and status = 'opening_soon';

commit;
