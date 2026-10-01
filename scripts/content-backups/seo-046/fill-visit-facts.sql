-- SEO-046: hours, admission and parking for the 22 attractions, from each
-- attraction's own site, with the pages they came from.
--
-- Applied 2026-10-01 against production with psql, after migration
-- 20261019000001_attractions_visit_facts.sql. Backup of all 22 rows as they
-- stood before this ran: attractions-before.json (same folder). Every column
-- this touches was NULL on every row before (hours, hours_summary, is_free,
-- admission_summary, parking_summary, fact_sources, facts_verified_at), except
-- website on the six rows noted below. Nothing here deletes data.
--
-- HOW: every page below was fetched this session (2026-10-01) as raw HTML and
-- read as text. Where the row's website was a third-party listing (US News
-- travel pages), the official link on that listing was followed, and the US
-- News text itself was NOT used: it still describes COVID-era time slots and
-- 2021 prices. No fact comes from memory or a search snippet. A field a page
-- did not state is left NULL.
--
-- HOURS: attractions.hours is read by src/lib/attractionHours.ts. A seasonal
-- schedule carries valid_from / valid_through, so the page and the schema
-- stop asserting it the day after the season the site gave. hours_summary is
-- the site's own wording, shown when no structured season covers today.
--
-- slug                                   fields filled               evidence (fetched 2026-10-01)
-- adventureland                          admission, parking, is_free https://www.adventurelandpark.com/buy-tickets/ : "Any Day Admission ... One-Day Park Admission for any day through October 31, 2026 ... $69.99", "Children three and under receive free admission"; https://www.adventurelandpark.com/plan-your-visit/directions-parking/ : "Single Day Parking: $21", "Preferred Parking: $26". Hours: /calendar/ renders by script, no hours in the HTML -> NULL
-- adventureland-resort                   same as adventureland       duplicate row of the same park (US News listing linked www.adventurelandresort.com, which redirects to adventurelandpark.com). website US News -> https://www.adventurelandpark.com/
-- blank-park-zoo                         hours, admission, parking   https://www.blankparkzoo.com/faq : "open every day from 10:00 a.m. to 4:00 p.m., from Labor Day to Memorial Day. Final Admission ... 30 minutes before the Zoo closes", "closed Thanksgiving Day, Christmas Eve Day, Christmas Day, and New Year's Day", "Children (1 year and under) - Free / (2 - 12 years) - $15.00+ / Adults (13 - 64 years) - $20.00+ / Senior Citizens (65+ years) - $19.00+", "Is parking free? - Yes". Season = Labor Day 2026-09-07 to Memorial Day 2027-05-31. Summer hours not stated -> nothing after that. website US News -> https://www.blankparkzoo.com/
-- des-moines-art-center                  hours, admission, parking   https://desmoinesartcenter.org/visit/ : Mon Closed, Tue 10am-4pm, Wed 10am-4pm, Thu 10am-7pm, Fri 10am-7pm, Sat 10am-5pm, Sun 10am-5pm; "Admission is always free."; "Free parking is available on site."; closed New Year's Day, MLK Day, Memorial Day, July 4, Labor Day, Thanksgiving, Christmas
-- des-moines-downtown-farmers-market     hours, parking              https://www.dsmpartnership.com/desmoinesfarmersmarket/visit-the-market : "The 2026 Market runs every Saturday from May 2 through Oct. 31 ... 7 a.m. to Noon (8 a.m. to Noon in October)"; .../visit-the-market/directions-parking : free: Court Avenue Bridge, Grand Avenue Bridge, Iowa Cubs Stadium Lots (1 Line Drive); paid: Municipal 3rd and Court Garage (237 Court Ave.), Science Center Garage (401 W. MLK Jr.); free bike valet in the Terrus ramp at Second and Court. Structured hours = the October season only (Sat 8-12, 2026-10-01..2026-10-31); May-Sep has passed. Admission not stated -> NULL
-- greater-des-moines-botanical-garden    hours, admission, parking   https://dmbotanicalgarden.com/tickets-and-hours/ : "Sep 30 - Nov 12: Tuesday-Friday: 10 am-5 pm, Saturday-Sunday: 9 am-4 pm, Closed Mondays"; "Nov 13 - Jan 3 (Holiday Hours): Tuesday-Friday: 10 am-4pm, Saturday-Sundays: 9 am-4 pm, Closed Mondays"; Adults $14, Active/Retired Military $13, Seniors 65+ $13, Children 2-12 $10, Children up to 1 Free, SNAP or WIC EBT card + ID Free up to 4; https://dmbotanicalgarden.com/faqs/ : "parking at the Garden is free but there are limited spaces ... overflow parking available along Robert D. Ray Drive". Seasons stored: 2026-09-30..2026-11-12 and 2026-11-13..2027-01-03 (the page gives month-day ranges; the years are the current cycle)
-- high-trestle-trail                     hours, admission, is_free   https://www.inhf.org/what-we-do/protection/high-trestle-trail : "Hours: All hours", "Bridge light hours ... April-October: Sunset to 12 a.m. (midnight) / November- March: Sunset to 9:00pm", "Admission: Free". Parking not stated -> NULL. website US News -> the INHF page
-- iowa-state-capitol                     hours, admission, parking   https://www.legis.iowa.gov/resources/tourCapitol : "Building Hours Monday through Friday 8:00 a.m. to 4:45 p.m. Saturday 8:00 a.m. to 3:45 p.m.", "Free guided tours ... Monday through Saturday. Call 515.281.5591 for tour times. Self-guided tours are also available.", "Capitol parking map ... visitor lots, overflow lots ... accessible parking", "All bus parking is located on the west side of the Capitol along East Ninth Street". Sunday not stated -> left out, not marked closed. Building entry fee not stated -> is_free NULL. website US News -> the legis.iowa.gov page
-- state-capitol                          same as iowa-state-capitol  duplicate row of the same building (1007 E Grand Ave); no website on the row, facts from the page above
-- iowa-state-fair                        hours (dates), parking      https://www.iowastatefair.org/visit/frequently-asked-questions : "August 12-22, 2027"; https://www.iowastatefair.org/visit/parking-park-ride (still the 2026 page, "August 13-23"): "Parking is available in the A, B and C Lots off University Avenue for $10", free Blue Line shuttle in the lots, free park-and-ride. Parking text is labelled 2026. 2027 admission not yet posted (/visit/buy-tickets: "Watch for information about admission") -> NULL
-- john-and-mary-pappajohn-sculpture-park hours (text), parking, is_free  https://desmoinesartcenter.org/visit/pappajohn-sculpture-park/ : "open during city park hours - sunrise to midnight", "Ample metered street parking ... several accessible parking spots and nearby parking garages"; https://www.catchdesmoines.com/things-to-do/attractions/pappajohn-sculpture-park/ (the other row's stored website, Catch Des Moines): "best of all, it's free", "parking is free on Sundays". Sunrise varies -> text only, no structured hours
-- pappajohn-sculpture-park               same as above               duplicate row of the same park
-- prairie-meadows-racetrack-casino-and-hotel  hours, admission, parking, is_free  https://www.prairiemeadows.com/about-us/faqs : "Casino and Hotel are open 24 hours, 7 days a week. Our racetrack is open between May and September", "Admission is free to the Prairie Meadows Casino, Hotel and all of our live horse racing events", "Parking is free and plentiful", "valet service ... for a $7 fee ... daily from 10 AM to midnight"
-- principal-park                         hours (text), admission, parking  https://www.milb.com/iowa/ballpark/a-z-guide : "Gates open 60 minutes before first pitch for regularly scheduled home games", "Children 3 and under receive a free general admission ticket", "All parking at Principal Park is $13 and is run on a first-come, first-serve basis ... Parking is limited". The same page also has a stale "2021 season ... $12 per car" block; the undated $13 entry is used
-- science-center-of-iowa                 hours, admission, parking   https://www.sciowa.org/visit/planning-your-visit/hours-and-admission/ : Mon CLOSED, Tue CLOSED, Wed-Sun 9:00 am - 4:00 pm; "$15 for children ages 2-12; $20 for adults ages 13-64; seniors ages 65 and over are $15; Children under 2 years and SCI members are free", "$5 individual admission ... SNAP, WIC, or Medicaid"; https://www.sciowa.org/visit/planning-your-visit/directions-and-parking/ : "Covered ramp parking is available just across the street from SCI's main entrance at 4th and Market Street", pay through the QR code web page. website US News -> https://www.sciowa.org/
-- water-works-park                       hours, parking              https://www.dmww.com/parks___events/water_works_park.php (linked from the City of Des Moines parks page): "Des Moines Water Works Park Hours 6:00 am to 10:00 pm", "Use of the trail system after park hours is allowed, providing users stay on the trail", "All vehicle parking shall be confined to designated parking areas ... Vehicles are not allowed to park on the grass". No website on the row
-- gray-s-lake                            parking                     row website (US News) -> https://www.dsm.city/business_detail_T6_R58.php returns 404; its parks link leads to https://www.dsm.city/Gray_s_Lake_Park514.php : amenities "Parking Lots"; park hours are not on the page (it links to the municipal code) -> hours NULL. website -> the city page
-- a-h-blank-golf-course                  hours (text)                https://golfblank.com/ (linked from https://www.dsm.city/departments/parks_recreation/parks/golf.php): "OPEN hours 9:00 AM-7:00 PM". No days given -> text only. Green fees not on the page -> NULL. No website on the row
--
-- Nothing verified, left NULL:
-- 17th-avenue-dog-park      no website on the row. https://www.dsm.city/departments/parks_recreation/parks/dogs.php lists the city's three dog parks (Ewing, Reno Memorial, Riverwalk); this is not one of them, so the city's 6 a.m.-10 p.m. rule does not apply. Location unconfirmed - follow-up
-- 515-brewing-company       no website on the row
-- altoona-aquatics-park     no website on the row
-- east-village              no website on the row; a district, not a venue with hours

BEGIN;

UPDATE public.attractions SET
  admission_summary = 'One-day admission $69.99 online, good for any operating day through October 31, 2026. Children 3 and under free.',
  parking_summary = 'Single-day parking $21; preferred parking $26.',
  is_free = false,
  fact_sources = '[{"url":"https://www.adventurelandpark.com/buy-tickets/","fields":["admission","is_free"]},{"url":"https://www.adventurelandpark.com/plan-your-visit/directions-parking/","fields":["parking"]}]'::jsonb,
  facts_verified_at = '2026-10-01'
WHERE slug IN ('adventureland', 'adventureland-resort');

UPDATE public.attractions SET website = 'https://www.adventurelandpark.com/'
WHERE slug = 'adventureland-resort';

UPDATE public.attractions SET
  website = 'https://www.blankparkzoo.com/',
  hours = '[{"valid_from":"2026-09-07","valid_through":"2027-05-31","mon":{"open":"10:00","close":"16:00"},"tue":{"open":"10:00","close":"16:00"},"wed":{"open":"10:00","close":"16:00"},"thu":{"open":"10:00","close":"16:00"},"fri":{"open":"10:00","close":"16:00"},"sat":{"open":"10:00","close":"16:00"},"sun":{"open":"10:00","close":"16:00"}}]'::jsonb,
  hours_summary = '10 AM to 4 PM daily from Labor Day to Memorial Day; last admission 30 minutes before close. Closed Thanksgiving, Christmas Eve, Christmas Day and New Year''s Day.',
  admission_summary = 'Adults (13-64) from $20, seniors (65+) from $19, children (2-12) from $15, 1 and under free.',
  parking_summary = 'Free.',
  is_free = false,
  fact_sources = '[{"url":"https://www.blankparkzoo.com/faq","fields":["hours","admission","parking","is_free"]}]'::jsonb,
  facts_verified_at = '2026-10-01'
WHERE slug = 'blank-park-zoo';

UPDATE public.attractions SET
  hours = '{"mon":"closed","tue":{"open":"10:00","close":"16:00"},"wed":{"open":"10:00","close":"16:00"},"thu":{"open":"10:00","close":"19:00"},"fri":{"open":"10:00","close":"19:00"},"sat":{"open":"10:00","close":"17:00"},"sun":{"open":"10:00","close":"17:00"}}'::jsonb,
  hours_summary = 'Closed Mondays and on New Year''s Day, Martin Luther King Jr. Day, Memorial Day, July 4, Labor Day, Thanksgiving and Christmas.',
  admission_summary = 'Free.',
  parking_summary = 'Free parking on site.',
  is_free = true,
  fact_sources = '[{"url":"https://desmoinesartcenter.org/visit/","fields":["hours","admission","parking","is_free"]}]'::jsonb,
  facts_verified_at = '2026-10-01'
WHERE slug = 'des-moines-art-center';

UPDATE public.attractions SET
  hours = '[{"valid_from":"2026-10-01","valid_through":"2026-10-31","sat":{"open":"08:00","close":"12:00"}}]'::jsonb,
  hours_summary = 'Saturdays from May 2 to October 31, 2026: 7 AM to noon, 8 AM to noon in October.',
  parking_summary = 'Free on the Court Avenue and Grand Avenue bridges and in the Iowa Cubs stadium lots (1 Line Drive). Paid at the 3rd and Court garage (237 Court Ave.) and the Science Center garage (401 W. MLK Jr. Pkwy). Free bike valet in the Terrus ramp at Second Street and Court Avenue.',
  fact_sources = '[{"url":"https://www.dsmpartnership.com/desmoinesfarmersmarket/visit-the-market","fields":["hours"]},{"url":"https://www.dsmpartnership.com/desmoinesfarmersmarket/visit-the-market/directions-parking","fields":["parking"]}]'::jsonb,
  facts_verified_at = '2026-10-01'
WHERE slug = 'des-moines-downtown-farmers-market';

UPDATE public.attractions SET
  hours = '[{"valid_from":"2026-09-30","valid_through":"2026-11-12","mon":"closed","tue":{"open":"10:00","close":"17:00"},"wed":{"open":"10:00","close":"17:00"},"thu":{"open":"10:00","close":"17:00"},"fri":{"open":"10:00","close":"17:00"},"sat":{"open":"09:00","close":"16:00"},"sun":{"open":"09:00","close":"16:00"}},{"valid_from":"2026-11-13","valid_through":"2027-01-03","mon":"closed","tue":{"open":"10:00","close":"16:00"},"wed":{"open":"10:00","close":"16:00"},"thu":{"open":"10:00","close":"16:00"},"fri":{"open":"10:00","close":"16:00"},"sat":{"open":"09:00","close":"16:00"},"sun":{"open":"09:00","close":"16:00"}}]'::jsonb,
  hours_summary = 'Hours change by season. September 30 to November 12: Tuesday to Friday 10 AM to 5 PM, Saturday and Sunday 9 AM to 4 PM. November 13 to January 3: Tuesday to Friday 10 AM to 4 PM, Saturday and Sunday 9 AM to 4 PM. Closed Mondays.',
  admission_summary = 'Adults $14, seniors (65+) and active or retired military $13, children 2-12 $10, children up to 1 free. Free for up to 4 with a SNAP or WIC EBT card and ID.',
  parking_summary = 'Free, with limited spaces. Overflow parking along Robert D. Ray Drive during large events.',
  is_free = false,
  fact_sources = '[{"url":"https://dmbotanicalgarden.com/tickets-and-hours/","fields":["hours","admission","is_free"]},{"url":"https://dmbotanicalgarden.com/faqs/","fields":["parking"]}]'::jsonb,
  facts_verified_at = '2026-10-01'
WHERE slug = 'greater-des-moines-botanical-garden';

UPDATE public.attractions SET
  website = 'https://www.inhf.org/what-we-do/protection/high-trestle-trail',
  hours = '{"mon":{"open":"00:00","close":"24:00"},"tue":{"open":"00:00","close":"24:00"},"wed":{"open":"00:00","close":"24:00"},"thu":{"open":"00:00","close":"24:00"},"fri":{"open":"00:00","close":"24:00"},"sat":{"open":"00:00","close":"24:00"},"sun":{"open":"00:00","close":"24:00"}}'::jsonb,
  hours_summary = 'Open all hours. The bridge lights run from sunset to midnight April to October, and sunset to 9 PM November to March.',
  admission_summary = 'Free.',
  is_free = true,
  fact_sources = '[{"url":"https://www.inhf.org/what-we-do/protection/high-trestle-trail","fields":["hours","admission","is_free"]}]'::jsonb,
  facts_verified_at = '2026-10-01'
WHERE slug = 'high-trestle-trail';

UPDATE public.attractions SET
  hours = '{"mon":{"open":"08:00","close":"16:45"},"tue":{"open":"08:00","close":"16:45"},"wed":{"open":"08:00","close":"16:45"},"thu":{"open":"08:00","close":"16:45"},"fri":{"open":"08:00","close":"16:45"},"sat":{"open":"08:00","close":"15:45"}}'::jsonb,
  hours_summary = 'Building open Monday to Friday 8 AM to 4:45 PM and Saturday 8 AM to 3:45 PM.',
  admission_summary = 'Free guided tours Monday through Saturday; call 515-281-5591 for tour times. Self-guided tours are also available.',
  parking_summary = 'Visitor lots, overflow lots and accessible spaces are marked on the Capitol Complex parking map. Buses park on East Ninth Street, west of the Capitol.',
  fact_sources = '[{"url":"https://www.legis.iowa.gov/resources/tourCapitol","fields":["hours","admission","parking"]}]'::jsonb,
  facts_verified_at = '2026-10-01'
WHERE slug IN ('iowa-state-capitol', 'state-capitol');

UPDATE public.attractions SET website = 'https://www.legis.iowa.gov/resources/tourCapitol'
WHERE slug = 'iowa-state-capitol';

UPDATE public.attractions SET
  hours_summary = 'The 2027 Fair runs August 12-22, 2027.',
  parking_summary = 'At the 2026 Fair: $10 in the A, B and C lots off University Avenue, with a free shuttle from the lots to the gates, and free park-and-ride from lots around the metro.',
  fact_sources = '[{"url":"https://www.iowastatefair.org/visit/frequently-asked-questions","fields":["hours"]},{"url":"https://www.iowastatefair.org/visit/parking-park-ride","fields":["parking"]}]'::jsonb,
  facts_verified_at = '2026-10-01'
WHERE slug = 'iowa-state-fair';

UPDATE public.attractions SET
  hours_summary = 'Open during city park hours, sunrise to midnight.',
  admission_summary = 'Free.',
  parking_summary = 'Metered street parking around the park, free on Sundays, plus several accessible spaces and nearby parking garages.',
  is_free = true,
  fact_sources = '[{"url":"https://desmoinesartcenter.org/visit/pappajohn-sculpture-park/","fields":["hours","parking"]},{"url":"https://www.catchdesmoines.com/things-to-do/attractions/pappajohn-sculpture-park/","fields":["admission","is_free","parking"]}]'::jsonb,
  facts_verified_at = '2026-10-01'
WHERE slug IN ('john-and-mary-pappajohn-sculpture-park', 'pappajohn-sculpture-park');

UPDATE public.attractions SET
  hours = '{"mon":{"open":"00:00","close":"24:00"},"tue":{"open":"00:00","close":"24:00"},"wed":{"open":"00:00","close":"24:00"},"thu":{"open":"00:00","close":"24:00"},"fri":{"open":"00:00","close":"24:00"},"sat":{"open":"00:00","close":"24:00"},"sun":{"open":"00:00","close":"24:00"}}'::jsonb,
  hours_summary = 'Casino and hotel open 24 hours, 7 days a week. The racetrack runs May to September during the racing season.',
  admission_summary = 'Free to the casino, the hotel and live horse racing.',
  parking_summary = 'Free. Valet at the main casino entrance for $7, daily 10 AM to midnight.',
  is_free = true,
  fact_sources = '[{"url":"https://www.prairiemeadows.com/about-us/faqs","fields":["hours","admission","parking","is_free"]}]'::jsonb,
  facts_verified_at = '2026-10-01'
WHERE slug = 'prairie-meadows-racetrack-casino-and-hotel';

UPDATE public.attractions SET
  hours_summary = 'Gates open 60 minutes before first pitch for regularly scheduled Iowa Cubs home games.',
  admission_summary = 'Tickets by game. Children 3 and under get a free general admission ticket.',
  parking_summary = '$13 per car, first come first served. Parking is limited.',
  fact_sources = '[{"url":"https://www.milb.com/iowa/ballpark/a-z-guide","fields":["hours","admission","parking"]}]'::jsonb,
  facts_verified_at = '2026-10-01'
WHERE slug = 'principal-park';

UPDATE public.attractions SET
  website = 'https://www.sciowa.org/',
  hours = '{"mon":"closed","tue":"closed","wed":{"open":"09:00","close":"16:00"},"thu":{"open":"09:00","close":"16:00"},"fri":{"open":"09:00","close":"16:00"},"sat":{"open":"09:00","close":"16:00"},"sun":{"open":"09:00","close":"16:00"}}'::jsonb,
  hours_summary = 'Wednesday to Sunday 9 AM to 4 PM; closed Monday and Tuesday. Holiday hours are on the Science Center site.',
  admission_summary = 'Adults (13-64) $20, children (2-12) $15, seniors (65+) $15, under 2 free. $5 per person with SNAP, WIC or Medicaid (in person).',
  parking_summary = 'Covered parking ramp across the street from the main entrance at 4th and Market Street; pay through the QR code on the ramp signs.',
  is_free = false,
  fact_sources = '[{"url":"https://www.sciowa.org/visit/planning-your-visit/hours-and-admission/","fields":["hours","admission","is_free"]},{"url":"https://www.sciowa.org/visit/planning-your-visit/directions-and-parking/","fields":["parking"]}]'::jsonb,
  facts_verified_at = '2026-10-01'
WHERE slug = 'science-center-of-iowa';

UPDATE public.attractions SET
  hours = '{"mon":{"open":"06:00","close":"22:00"},"tue":{"open":"06:00","close":"22:00"},"wed":{"open":"06:00","close":"22:00"},"thu":{"open":"06:00","close":"22:00"},"fri":{"open":"06:00","close":"22:00"},"sat":{"open":"06:00","close":"22:00"},"sun":{"open":"06:00","close":"22:00"}}'::jsonb,
  hours_summary = 'Park open 6 AM to 10 PM. The trails can be used after park hours if you stay on the trail.',
  parking_summary = 'Designated parking areas only; no parking on the grass.',
  fact_sources = '[{"url":"https://www.dmww.com/parks___events/water_works_park.php","fields":["hours","parking"]}]'::jsonb,
  facts_verified_at = '2026-10-01'
WHERE slug = 'water-works-park';

UPDATE public.attractions SET
  website = 'https://www.dsm.city/Gray_s_Lake_Park514.php',
  parking_summary = 'Parking lots in the park.',
  fact_sources = '[{"url":"https://www.dsm.city/Gray_s_Lake_Park514.php","fields":["parking"]}]'::jsonb,
  facts_verified_at = '2026-10-01'
WHERE slug = 'gray-s-lake';

UPDATE public.attractions SET
  hours_summary = 'Open 9 AM to 7 PM.',
  fact_sources = '[{"url":"https://golfblank.com/","fields":["hours"]}]'::jsonb,
  facts_verified_at = '2026-10-01'
WHERE slug = 'a-h-blank-golf-course';

COMMIT;
