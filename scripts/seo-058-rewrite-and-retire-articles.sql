-- SEO-058: rewrite or retire the fifteen 2025 articles that failed fact checks.
-- Run against production 2026-10-01, after migration
-- 20261016000001_articles_publishable_body_guard.sql (so every new body below
-- went through the publish guard on the way in).
--
-- Starting audit: the header of scripts/seo-053-retire-fabricated-articles.sql.
-- Every row was backed up first to scripts/content-backups/seo-058/.
-- GSC impressions are the 3-month export to 2026-09-30 (Keyword/.../Pages.csv).
--
-- Every venue in a rewrite was checked on 2026-10-01 against a page fetched that
-- day (the business's own site, or a current Restaurantji / Tripadvisor /
-- joe.coffee / directory listing where the site would not load). Anything
-- closed, moved or unverifiable was dropped, not guessed. Each article carries
-- its own Sources list and a "What changed" note naming what was dropped.
-- Bodies are markdown (ArticleDetails renders react-markdown + remark-gfm).
-- Venues that are rows in public.restaurants link to /restaurants/<slug>.
--
-- REWRITTEN IN PLACE (same slug, published_at kept, updated_at = now()):
--   patio-guide          1,043 impr  13 venues kept. Dropped from the old text:
--                        Juniper Moon (closed 2025-05-31), Star Bar (closed
--                        2026-08-01), Up-Down (no patio), Harbinger and RoCA
--                        (no outdoor seating confirmed). Old body was raw JSON
--                        with 9 of 20 spots and two [Content continues] markers.
--   soups-on               449 impr  11 soups kept, each seen on a current
--                        menu. Dropped: Django (closed 2026-03-14), Ritual Cafe
--                        (closed 2025-08-01), Malo (site announces final day),
--                        Lucca and Fong's (named soup not on menu), 801
--                        Chophouse, Jethro's, HoQ, Thai Flavors (soup not seen
--                        on a fetchable current menu). Royal Mile and Bubba
--                        moved to their real downtown addresses.
--   cozy-coffee-crawl      113 impr  14 shops kept. Dropped: Ritual Cafe (closed
--                        2025-08-01), Java Joes downtown (closed; Ankeny kept),
--                        Scratch Cupcakery (metro shop closed), Fong's Tea House,
--                        Scenic Valley Cafe, Blaze Coffee Roasters, Cortado (none
--                        exist in the metro), Confluence "coffee bar" (none).
--                        Mars Cafe and Zanzibar's moved to their real areas.
--   highland-park-crawl     74 impr  6 places kept (3 in the district, 3 nearby
--                        with distances). Dropped: Mi Patria (West Des Moines),
--                        Vientiane (gone), Alegrias Seafood (closed). Old body was
--                        raw JSON with 1 of 8 restaurants written.
--   drake-food-guide        41 impr  7 places kept. Dropped: Gazali's (moved to
--                        Clive 2021, closed 2024-02-15), La Mie "Express" (no such
--                        location), Jethro's Forest Ave (fire, 2022), Papa Keno's
--                        (closed 2020), Fernando's (open status unconfirmed).
--   valley-junction-trail   36 impr  All 15 invented "makers" removed; 12 real
--                        5th Street / Elm St shops with directory or own-site
--                        hours, plus the fall event dates from valleyjunction.com.
--   hidden-history          23 impr  10 historic sites from official pages.
--                        Dropped: the "Green Hat Club" and Court Ave speakeasy
--                        claims (no source), closed Django/Americana/Peace Tree.
--   budget-explorers         5 impr  12 free/low-cost items from official pages.
--                        Botanical Garden corrected to $14; Neal Smith Trail to
--                        24.8 mi; the unsourced "Fall Art Festival" removed;
--                        Blank Park Zoo dropped (over $15).
--
-- ARCHIVED + 301 (zero impressions in 3 months; raw JSON bodies with failed
-- facts; not worth a rewrite because a live hub already covers each topic):
--   beaverdale          -> /neighborhoods/beaverdale
--   date-night          -> /events/date-night
--   indoor-farmers-markets-2023-24 -> /things-to-do/winter
--   air-conditioned     -> /things-to-do
--   oktoberfest-2023    -> /guides/fall-festivals
--   last-call-farmers-market -> /neighborhoods/downtown
--   summer-saturday     -> /neighborhoods/downtown
--
-- Triggers: trigger_article_webhook posts to social only when status changes
-- TO 'published' (read from pg_get_functiondef on 2026-10-01). Every row here
-- was already published, so the rewrites and the archives fire nothing social.
-- The word-count, updated_at and sitemap-queue triggers run normally.
--
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/seo-058-rewrite-and-retire-articles.sql

begin;

-- 51e4b809-45e3-43df-a1d9-146d1857c07b patio
update public.articles set
  title = 'Best Patios and Rooftops in Des Moines (2026)',
  excerpt = 'The best rooftop in Des Moines for a fall evening is The Republic on Grand, with heaters and a fireplace six floors above the East Village. Here are 13 patios, rooftops and beer gardens, each checked open on October 1, 2026.',
  seo_title = 'Best Patios & Rooftop Bars in Des Moines (2026)',
  seo_description = '13 Des Moines patios, rooftops and beer gardens checked open on October 1, 2026: The Republic on Grand, Alba, Big Grove, Eatery A, The Dam Pub, Wellman''s and more.',
  seo_keywords = array['des moines patios','best patios des moines','rooftop bars des moines','outdoor dining des moines','beer gardens des moines','east village patios','the republic on grand'],
  tags = array['patios','rooftop bars','outdoor dining','breweries','East Village','Ingersoll'],
  category = 'Food & Drink',
  content = $c$**Updated October 1, 2026.** Every venue below was checked against its own website (or a current listing) on that day for its address, its hours and the fact that it still has outdoor seating. Places from the earlier version of this guide that have closed or don't have a patio were taken out.

The best rooftop in Des Moines for a fall evening is **The Republic on Grand**, six floors above the East Village with radiant heaters on one patio and a fireplace on the other. For a big outdoor space with room for a group and a dog, go to the **Big Grove Brewery** beer garden on 17th Street. If you want dinner rather than drinks, **Alba** in the East Village and **Eatery A** on Ingersoll both serve full menus on their patios.

Patio season in Iowa runs on the weather, not the calendar. Before you go in October or November, check the venue's site or social feed for whether the patio is open that night.

## Patios at a glance

| Venue | Area | Type | Good to know |
|---|---|---|---|
| The Republic on Grand | East Village | Rooftop | Heaters, fireplace, skyline view |
| Alba | East Village | Patio | Happy hour 4-6 pm on the patio |
| Court Avenue Restaurant & Brewing Co. | Court Avenue | Sidewalk patio | House beer since 1996 |
| Eatery A | Ingersoll | Patio | Wood-fired pizza |
| Big Grove Brewery | Ingersoll area | Beer garden | Dog-friendly, outdoor fireplaces |
| Lua Brewing | Sherman Hill | Patio | Dog-friendly |
| Exile Brewing | Sherman Hill | Patio | Murals; closed Mondays |
| Confluence Brewing | Gray's Lake | Patio | Dog-friendly |
| The Dam Pub | Beaverdale | Rooftop and patio | Pets welcome outside |
| Jasper Winery | South of downtown | Lawn patio | Fall tasting room Thu-Sun |
| Gilroy's Kitchen + Pub + Patio | West Des Moines | Patio | Patio tables can be reserved |
| Wellman's Pub & Rooftop | West Des Moines | Rooftop and patio | Open every day of the year |
| Zeke's Rooftop + Grill | Johnston | Rooftop | Overlooks The Yard |

## Downtown and the East Village

### The Republic on Grand

A rooftop bar on the sixth floor of the AC Hotel. It has two outdoor spaces: the South patio holds about 100 people and has its own outdoor bar and radiant heaters, and the West patio has a fireplace and a view of the downtown skyline.

- **Where:** 401 E Grand Ave, Des Moines (East Village)
- **Hours posted:** Monday-Thursday 3-10 pm, Friday-Saturday 2 pm to midnight
- **Site:** [therepublicongrand.com](https://therepublicongrand.com/) | [Our listing](/restaurants/the-republic-on-grand)

### Alba

A full-service restaurant on East 6th Street. Happy hour runs 4-6 pm every day, and the restaurant says it's served at the bar and on the patio.

- **Where:** 524 E 6th St, Des Moines (East Village)
- **Hours posted:** dinner daily from 4 pm
- **Site:** [albadsm.com](https://albadsm.com/) | [Our listing](/restaurants/alba)

### Court Avenue Restaurant & Brewing Co.

A brewpub in the Saddlery Building that has brewed its own beer since 1996, with a sidewalk patio on Court Avenue.

- **Where:** 309 Court Ave, Des Moines (Court Avenue District)
- **Hours posted:** Monday-Thursday 11 am-10 pm, brunch on weekends
- **Site:** [courtavebrew.com](https://courtavebrew.com/)

## Ingersoll, Sherman Hill and Gray's Lake

### Eatery A

The restaurant's own site describes a spacious patio. The menu leans on wood-fired pizza, and happy hour is 2-6 pm.

- **Where:** 2932 Ingersoll Ave, Des Moines
- **Hours posted:** Monday-Thursday 11 am-10 pm, Friday-Saturday 9 am to midnight
- **Site:** [eateryadsm.com](https://eateryadsm.com/space) | [Our listing](/restaurants/eatery-a)

### Big Grove Brewery

The Des Moines taproom in the Crescent Building has a 12,000-square-foot beer garden that welcomes dogs and has outdoor fireplaces, which is what keeps it usable into fall.

- **Where:** 555 17th St, Des Moines
- **Hours posted:** Sunday-Thursday 11 am-10 pm
- **Site:** [biggrove.com](https://biggrove.com/pages/des-moines-taproom) | [Our listing](/restaurants/big-grove-brewery-taproom)

### Lua Brewing

A Sherman Hill brewery with a large, dog-friendly patio. The hours on its site are labelled for winter, so check them closer to your visit.

- **Where:** 1525 High St, Des Moines (Sherman Hill)
- **Site:** [luabeer.com](https://luabeer.com/) | [Our listing](/restaurants/lua-brewing)

### Exile Brewing

A brewpub with a patio decorated with murals.

- **Where:** 1514 Walnut St, Des Moines
- **Hours posted:** Tuesday-Sunday; closed Mondays
- **Site:** [exilebrewing.com](https://exilebrewing.com/) | [Our listing](/restaurants/exile-brewing-company)

### Confluence Brewing

A brewery next to Gray's Lake Park with a large patio where dogs are welcome. It's an easy stop after a walk around the lake.

- **Where:** 1235 Thomas Beck Rd, Des Moines
- **Hours posted:** open daily
- **Site:** [confluencebrewing.com](https://confluencebrewing.com/)

## North side and south of downtown

### The Dam Pub

A Beaverdale bar with both a rooftop and a ground-level patio. Pets are welcome in the outdoor areas.

- **Where:** 2710 Beaver Ave, Des Moines (Beaverdale)
- **Hours posted:** open daily, until 2 am on Friday and Saturday
- **Site:** [dampubdsm.com](https://dampubdsm.com/) | [Our listing](/restaurants/the-dam-pub)

### Jasper Winery

A winery south of downtown with a patio on its front lawn.

- **Where:** 2400 George Flagg Pkwy, Des Moines
- **Fall tasting room hours posted:** Thursday-Saturday 10 am-6 pm, Sunday 1-5 pm
- **Site:** [jasperwinery.com](https://jasperwinery.com/)

## West Des Moines and Johnston

### Gilroy's Kitchen + Pub + Patio

The patio is in the name, and the restaurant takes reservations for patio tables in season.

- **Where:** 1238 8th St, West Des Moines
- **Site:** [gilroyskitchen.com](https://gilroyskitchen.com/) | [Our listing](/restaurants/gilroys-kitchen-pub-patio)

### Wellman's Pub & Rooftop

A rooftop bar with a patio below it. The pub says it's open 365 days a year, 11 am to 2 am.

- **Where:** 597 Market St, West Des Moines
- **Site:** [wellmanspub.com](https://wellmanspub.com/) | [Our listing](/restaurants/wellmans-pub-rooftop)

### Zeke's Rooftop + Grill

A rooftop restaurant at Johnston Town Center that looks over The Yard.

- **Where:** 6201 Merle Hay Rd, Suite 110, Johnston
- **Hours posted:** opens 11 am on weekdays and 9 am on weekends
- **Site:** [zekesrooftopandgrill.com](https://zekesrooftopandgrill.com/) | [Our listing](/restaurants/zekes-rooftop-grill)

## What changed from the earlier version

- **Juniper Moon** on Ingersoll closed on May 31, 2025.
- **Star Bar** on Ingersoll closed on August 1, 2026.
- **Up-Down** is still open on East Locust, but it's an indoor arcade bar with no rooftop or patio.
- **Harbinger** and **RoCA** are open, but we couldn't confirm outdoor seating at either, so they're not listed here.

## Sources

Checked October 1, 2026:

- [The Republic on Grand](https://therepublicongrand.com/) and its [private events page](https://therepublicongrand.com/private-events/)
- [Alba](https://albadsm.com/)
- [Court Avenue Restaurant & Brewing Co.](https://courtavebrew.com/)
- [Eatery A: the space](https://eateryadsm.com/space)
- [Big Grove Brewery, Des Moines taproom](https://biggrove.com/pages/des-moines-taproom)
- [Lua Brewing](https://luabeer.com/)
- [Exile Brewing](https://exilebrewing.com/)
- [Confluence Brewing](https://confluencebrewing.com/)
- [The Dam Pub](https://dampubdsm.com/)
- [Jasper Winery](https://jasperwinery.com/)
- [Gilroy's Kitchen + Pub + Patio](https://gilroyskitchen.com/)
- [Wellman's Pub & Rooftop](https://wellmanspub.com/)
- [Zeke's Rooftop + Grill](https://zekesrooftopandgrill.com/)
- [Catch Des Moines: Best patios in Greater Des Moines](https://catchdesmoines.com/blog/stories/post/best-patios-in-greater-des-moines/) (July 16, 2026), for the Big Grove, Exile, Confluence, Jasper and Zeke's patio details
$c$,
  updated_at = now()
where id = '51e4b809-45e3-43df-a1d9-146d1857c07b' and status = 'published';

-- 03ea3321-4b81-400c-a2e3-09e489e64bc6 soups
update public.articles set
  title = 'Best Soups in Des Moines This Fall: 11 Bowls on Current Menus (2026)',
  excerpt = 'Start with the Guinness Stew at The Royal Mile downtown, $5 a cup. Here are 11 Des Moines soups, from pho at A Dong to gumbo at Bubba, each seen on the restaurant''s own menu on October 1, 2026.',
  seo_title = 'Best Soups in Des Moines: 11 Fall Bowls (2026)',
  seo_description = '11 Des Moines soups on current menus as of October 1, 2026: Royal Mile Guinness stew, A Dong pho, Splash chowder and bisque, Bubba gumbo, Hessen Haus bier cheese and more.',
  seo_keywords = array['best soup des moines','soup des moines','pho des moines','clam chowder des moines','ramen des moines','fall comfort food des moines'],
  tags = array['soup','comfort food','fall','restaurants','downtown'],
  category = 'Food & Drink',
  content = $c$**Updated October 1, 2026.** Every soup below was on the restaurant's own online menu when we checked on that day, and every restaurant showed current hours. Prices are what the menu listed and can change. The earlier version of this guide sent readers to restaurants that have since closed and to soups that aren't on the menu; those are gone.

The soup to start with this fall is the **Guinness Stew at The Royal Mile** downtown, $5 a cup or $7.50 a bowl. For pho, go to **A Dong** on High Street. For a soup-and-sandwich lunch with a different lineup every day, **Pickerman's** in West Des Moines rotates French onion, clam chowder, chili and more. And if you're downtown, **Splash** serves New England clam chowder ($9) and a bowl of lobster bisque ($22).

## Des Moines soups at a glance

| Restaurant | Area | Soup | Price |
|---|---|---|---|
| The Royal Mile | Downtown | Guinness Stew | $5 cup / $7.50 bowl |
| A Dong | High Street | Pho (several kinds) | See menu |
| Splash Seafood Bar & Grill | Downtown | Clam chowder, lobster bisque | $9; $22 bowl |
| Bubba | Downtown | Cajun chicken & sausage gumbo | $6 / $8 |
| Hessen Haus | Downtown | German bier cheese soup | $5 cup / $7 bowl |
| Centro | Downtown | Tomato basil with tortellini | $6.49 |
| Zombie Burger + Drink Lab | East Village | Vegetarian chili | $4.50 |
| Gateway Market Cafe | Sherman Hill area | Rotating soups | $4.99 / $6.99 |
| Latin King | East side | Minestrone | $5 cup / $7 bowl |
| Pickerman's Soup & Sandwich | West Des Moines | Daily rotation | See menu |
| Hokkaido Ramen House | Ankeny | Tonkotsu, miso, shoyu ramen | See menu |

## Downtown

### The Royal Mile: Guinness Stew

A pub on 4th Street whose menu lists a Guinness Stew, $5 a cup or $7.50 a bowl.

- **Where:** 210 4th St, Des Moines
- **Menu:** [royalmilebar.com](https://royalmilebar.com/des-moines-downtown-des-moines-royal-mile-food-menu) | [Our listing](/restaurants/the-royal-mile)

### Splash Seafood Bar & Grill: clam chowder and lobster bisque

The downtown seafood restaurant lists New England clam chowder at $9 and a bowl of lobster bisque at $22.

- **Where:** 303 Locust St, Des Moines
- **Menu:** [splash-seafood.com](https://splash-seafood.com/menu)

### Bubba: chicken and sausage gumbo

Bubba's menu on 10th Street includes a Cajun chicken and sausage gumbo, $6 or $8.

- **Where:** 200 10th St, Des Moines
- **Menu:** [bubbadsm.com](https://bubbadsm.com/menu) | [Our listing](/restaurants/bubba)

### Hessen Haus: German bier cheese soup

Hessen Haus, a German bierhall, has three soups at $5 a cup and $7 a bowl: German bier cheese, Jager chili and creamy tomato basil.

- **Where:** 101 SW 4th St, Des Moines
- **Menu:** [hessenhaus.com](https://hessenhaus.com/des-moines-hessen-haus-food-menu) | [Our listing](/restaurants/hessen-haus)

### Centro: tomato basil soup with tortellini

Centro's tomato basil soup comes with cheese tortellini, $6.49.

- **Where:** 1003 Locust St, Des Moines
- **Menu:** [centrodesmoines.com](https://centrodesmoines.com/menu) | [Our listing](/restaurants/centro)

### A Dong: pho

A Vietnamese restaurant on High Street, on the west edge of downtown, with a page of pho on the menu, from Pho A Dong to Pho Tai and Pho Tai Chin. Closed Mondays.

- **Where:** 1511 High St, Des Moines
- **Menu:** [A Dong online menu](https://adongrestaurant.netwaiter.com/des-moines/menu) | [Our listing](/restaurants/a-dong)

## East Village and Sherman Hill

### Zombie Burger + Drink Lab: vegetarian chili

The East Village burger bar lists a vegetarian chili for $4.50.

- **Where:** 300 E Grand Ave, Des Moines
- **Hours posted:** Sunday-Thursday 11 am-9 pm, Friday-Saturday 11 am-10 pm
- **Menu:** [zombieburgerdm.com](https://zombieburgerdm.com/des-moines-downtown) | [Our listing](/restaurants/zombie-burger-drink-lab)

### Gateway Market Cafe: rotating soups

The grocery's cafe lists chicken corn tortilla, chicken noodle, a vegan veggie chili and tomato basil bisque, at $4.99 and $6.99.

- **Where:** 2002 Woodland Ave, Des Moines
- **Hours posted:** daily 8 am-9 pm
- **Menu:** [gatewaymarket.com](https://gatewaymarket.com/cafe-carryout)

## East side

### Latin King: minestrone

The Italian restaurant on Hubbell Avenue lists minestrone at $5 a cup and $7 a bowl.

- **Where:** 2200 Hubbell Ave, Des Moines
- **Menu:** [latinkingdsm.com](https://latinkingdsm.com/menus) | [Our listing](/restaurants/latin-king-italian-dining)

## Suburbs

### Pickerman's Soup & Sandwich: the daily rotation

A soup-and-sandwich shop whose rotation includes French onion, clam chowder, chili, chicken tortilla, Italian wedding and potato cheddar. Not every soup is on every day. The dining room is open weekdays, 11 am-2 pm.

- **Where:** 6750 Westown Pkwy, West Des Moines
- **Menu:** [pickermansdeli.com](https://pickermansdeli.com/west-des-moines-pickerman-s-soup-and-sandwich-food-menu) | [Our listing](/restaurants/pickermans-soup-sandwich)

### Hokkaido Ramen House: ramen

An Ankeny ramen shop with tonkotsu, miso and shoyu ramen on its menu. The menu images on its site are from late 2024, so prices may have changed.

- **Where:** 2732 SE Delaware Ave, Suite 310, Ankeny
- **Menu:** [hokkaidoramenankeny.com](https://hokkaidoramenankeny.com/menu) | [Our listing](/restaurants/hokkaido-ramen-house)

## What changed from the earlier version

- **Django** closed; its last day was March 14, 2026.
- **Ritual Cafe** closed on August 1, 2025.
- **Malo**'s own site announces a final day of service, so it's out.
- **Lucca** and **Fong's Pizza** are open, but neither menu lists the soups the earlier version named.
- **801 Chophouse**, **Jethro's BBQ**, **HoQ** and **Thai Flavors** may still serve the soups the earlier version described, but we couldn't see them on a current menu, so they aren't listed.

## Sources

Checked October 1, 2026:

- [The Royal Mile food menu](https://royalmilebar.com/des-moines-downtown-des-moines-royal-mile-food-menu)
- [Splash Seafood Bar & Grill menu](https://splash-seafood.com/menu)
- [Bubba menu](https://bubbadsm.com/menu)
- [Hessen Haus food menu](https://hessenhaus.com/des-moines-hessen-haus-food-menu)
- [Centro menu](https://centrodesmoines.com/menu)
- [A Dong online menu](https://adongrestaurant.netwaiter.com/des-moines/menu) and [adongdesmoines.com](https://adongdesmoines.com/)
- [Zombie Burger + Drink Lab](https://zombieburgerdm.com/des-moines-downtown)
- [Gateway Market cafe and carryout](https://gatewaymarket.com/cafe-carryout)
- [Latin King menus](https://latinkingdsm.com/menus)
- [Pickerman's West Des Moines menu](https://pickermansdeli.com/west-des-moines-pickerman-s-soup-and-sandwich-food-menu)
- [Hokkaido Ramen House menu](https://hokkaidoramenankeny.com/menu)
$c$,
  updated_at = now()
where id = '03ea3321-4b81-400c-a2e3-09e489e64bc6' and status = 'published';

-- d3b759c9-07b3-42c5-8294-698982d12560 coffee
update public.articles set
  title = 'Des Moines Coffee Crawl: 14 Local Coffee Shops for Fall (2026)',
  excerpt = 'For a walkable Des Moines coffee crawl, start in the East Village at Scenic Route Bakery and Daisy Chain Coffee, then head to Horizon Line and Northern Vessel. Here are 14 local coffee shops across the metro, each checked open on October 1, 2026.',
  seo_title = 'Des Moines Coffee Crawl: 14 Local Coffee Shops (2026)',
  seo_description = '14 local Des Moines coffee shops checked open on October 1, 2026, from the East Village to Ankeny: Zanzibar''s, Horizon Line, Northern Vessel, Smokey Row, Grounds for Celebration and more.',
  seo_keywords = array['des moines coffee shops','coffee crawl des moines','best coffee des moines','local coffee des moines','east village coffee','coffee roasters des moines'],
  tags = array['coffee','coffee shops','cafes','East Village','fall'],
  category = 'Food & Drink',
  content = $c$**Updated October 1, 2026.** Every shop below was checked on that day against its own website or a current listing for its address and hours. Shops from the earlier version of this guide that have closed, or that we couldn't find at all, were taken out.

For a coffee crawl you can do on foot, start in the **East Village**: Scenic Route Bakery and Daisy Chain Coffee are a few blocks apart, and Horizon Line Coffee and Northern Vessel are a short drive west. If you only have time for one stop, **Zanzibar's Coffee Adventure** on Ingersoll has roasted its own beans on site since 1993. For a fall drink in the suburbs, **Java Joes** in Ankeny lists a caramel apple cider and pumpkin drinks.

Hours below are what each shop posted on October 1. Several shops close mid-afternoon, so check before a late visit.

## Coffee shops at a glance

| Shop | Area | Known for |
|---|---|---|
| Scenic Route Bakery | East Village | Bakery case, honey bee latte |
| Daisy Chain Coffee | East Village | Honey from the owner's bees |
| Horizon Line Coffee | West End | Roastery, house syrups |
| Northern Vessel | Downtown | Bottled cold brew |
| Zanzibar's Coffee Adventure | Ingersoll | Roasting on site since 1993 |
| Smokey Row Coffee | Drake / Cottage Grove | Open until 9 pm |
| Mars Cafe | Drake | Chai latte, pour-overs |
| Grounds for Celebration | Beaverdale | Roasts in house |
| The Slow Down Coffee Co. | Highland Park | Open until 8 pm weekdays |
| Corazon Coffee Roasters | Valley Junction | Organic, fair trade roasts |
| Friedrichs Coffee | Urbandale | Fireplace and drive-thru |
| Lightbrite Coffee Roasters | Grimes | Seasonal drinks |
| Java Joes | Ankeny | Fall drink menu |
| Porch Light Coffeehouse | Ankeny | Tiny donuts |

## East Village and downtown

### Scenic Route Bakery

A bakery and coffee bar with a case of croissants, pinwheels and cinnamon rolls. The drink menu includes a honey bee latte.

- **Where:** 350 E Locust St, Suite 104, Des Moines (East Village)
- **Hours listed:** Monday-Saturday 7 am-4 pm

### Daisy Chain Coffee

A small East Village shop that uses raw honey from the owner's own bees and keeps three to five seasonal drinks on rotation.

- **Where:** 505 E Grand Ave, #104, Des Moines (East Village)
- **Hours listed:** weekdays 7:30 am-4 pm, weekends 8 am-4 pm

### Horizon Line Coffee

A roastery in the West End with house-made syrups, including brown sugar and lavender thyme.

- **Where:** 1417 Walnut St, Suite B, Des Moines
- **Hours:** the site lists 8 am-3 pm daily in one place and later hours in its footer, so check before an afternoon visit
- **Site:** [horizonlinecoffee.com](https://horizonlinecoffee.com/)

### Northern Vessel

A downtown coffee bar that sells 35-ounce bottles of cold brew to take home.

- **Where:** 1201 Keosauqua Way, Suite 100, Des Moines
- **Hours posted:** Monday-Saturday 6 am-6 pm, closed Sunday
- **Site:** [northernvessel.com](https://northernvessel.com/)

## Ingersoll, Drake and the north side

### Zanzibar's Coffee Adventure

An Ingersoll Avenue shop that has done small-batch roasting on site since 1993.

- **Where:** 2723 Ingersoll Ave, Des Moines
- **Hours posted:** Monday-Saturday 6:30 am-4 pm, Sunday 8 am-4 pm
- **Site:** [zanzibarscoffee.com](https://zanzibarscoffee.com/)

### Smokey Row Coffee

The Des Moines Smokey Row is on Cottage Grove near Drake, and it keeps the latest hours on this list.

- **Where:** 1910 Cottage Grove Ave, Des Moines
- **Hours posted:** daily 6 am-9 pm
- **Site:** [smokeyrow.com](https://smokeyrow.com/locations/)

### Mars Cafe

A Drake neighborhood cafe on University Avenue. Recent reviews single out the chai latte and the pour-overs. Listings disagree on its hours, so check before you go.

- **Where:** 2318 University Ave, Des Moines (Drake)

### Grounds for Celebration

A local roaster with its flagship in Beaverdale. A pound of its Ethiopia Yirgacheffe was $17.25 on its site. It also has shops at 6601 University Ave in Windsor Heights and at 5950 University Ave in West Des Moines (weekdays only).

- **Where:** 2709 Beaver Ave, Des Moines (Beaverdale)
- **Site:** [groundsdsm.com](https://groundsdsm.com/)

### The Slow Down Coffee Co.

A coffee shop in the Highland Park business district that stays open into the evening on weekdays.

- **Where:** 3613 6th Ave, Des Moines (Highland Park)
- **Hours posted:** weekdays 6:30 am-8 pm, weekends 7 am-5 pm
- **Site:** [theslowdowndsm.com](https://theslowdowndsm.com/)

## Suburbs

### Corazon Coffee Roasters

A Valley Junction roaster working with organic, fair trade beans. A pound was $24 on its site.

- **Where:** 516 Elm St, West Des Moines (Valley Junction)
- **Hours posted:** Tuesday-Friday 10 am-5 pm, Saturday 10 am-2 pm
- **Site:** [corazoncoffeeroasters.com](https://corazoncoffeeroasters.com/)

### Friedrichs Coffee

An Urbandale shop with a fireplace, a drive-thru and loose-leaf tea.

- **Where:** 4632 NW 86th St, Urbandale
- **Hours listed:** weekdays 6 am-6 pm, weekends 7 am-5 pm

### Lightbrite Coffee Roasters

A Grimes roaster that runs a San Franciscan roaster in the shop and rotates seasonal drinks.

- **Where:** 1895 SE Grimes Blvd, Suite 104, Grimes
- **Hours posted:** Monday-Saturday 7 am-2 pm
- **Site:** [lightbritecoffee.com](https://lightbritecoffee.com/)

### Java Joes

Java Joes closed its long-running downtown shop on 4th Street; the Ankeny location is still open. Its fall menu lists a caramel apple cider, an English toffee latte and pumpkin drinks.

- **Where:** 127 N Ankeny Blvd, Ankeny

### Porch Light Coffeehouse

An Uptown Ankeny coffeehouse known for its honey brown sugar latte and tiny donuts. It opens at 6:30 am Monday-Saturday; sources disagree on the closing time.

- **Where:** 417 SW 3rd St, Ankeny

## What changed from the earlier version

- **Ritual Cafe** on Locust Street closed on August 1, 2025.
- **Java Joes'** downtown shop at 214 4th St has closed; the Ankeny shop above is open.
- **Scratch Cupcakery** has closed its only metro location, in West Des Moines.
- **Mars Cafe** is in the Drake neighborhood, not the East Village. **Zanzibar's** is on Ingersoll, not in West Des Moines.
- **Fong's Tea House**, **Scenic Valley Cafe**, **Blaze Coffee Roasters** and a **Cortado** cafe don't exist in the Des Moines metro, and **Confluence Brewing** is a brewery without a coffee bar. All five are gone from this list.

## Sources

Checked October 1, 2026:

- [Horizon Line Coffee](https://horizonlinecoffee.com/)
- [Northern Vessel](https://northernvessel.com/)
- [Zanzibar's Coffee Adventure](https://zanzibarscoffee.com/)
- [Smokey Row Coffee locations](https://smokeyrow.com/locations/)
- [Grounds for Celebration](https://groundsdsm.com/)
- [The Slow Down Coffee Co.](https://theslowdowndsm.com/)
- [Corazon Coffee Roasters](https://corazoncoffeeroasters.com/)
- [Lightbrite Coffee Roasters](https://lightbritecoffee.com/)
- [Scenic Route Bakery on Restaurantji](https://www.restaurantji.com/ia/des-moines/scenic-route-bakery-/)
- [Daisy Chain Coffee on joe.coffee](https://joe.coffee/locations/ia/des-moines/daisy-chain-coffee-des-moines/)
- [Friedrichs Coffee on joe.coffee](https://joe.coffee/locations/ia/urbandale/friedrichs-coffee-urbandale/)
- [Porch Light Coffeehouse on joe.coffee](https://joe.coffee/locations/ia/ankeny/porch-light-coffeehouse-ankeny/)
- [Mars Cafe on Tripadvisor](https://www.tripadvisor.com/Restaurant_Review-g37835-d2478734)
- Java Joes Ankeny listing on joe.coffee
$c$,
  updated_at = now()
where id = 'd3b759c9-07b3-42c5-8294-698982d12560' and status = 'published';

-- 30f81e05-fe86-4276-a3f7-c767f2575431 highland
update public.articles set
  title = 'Highland Park Food Crawl: Where to Eat in Highland Park, Des Moines',
  excerpt = 'A Highland Park food crawl starts at 6th and Euclid, where Cha Cha''s Hiland Bakery, The Slow Down Coffee Co. and Chuck''s sit within a block. Here are six stops in and near the district, each checked open on October 1, 2026.',
  seo_title = 'Highland Park Des Moines Food Crawl: 6 Places to Eat',
  seo_description = 'Where to eat in Highland Park, Des Moines: Cha Cha''s Hiland Bakery, The Slow Down Coffee Co., Chuck''s, El Salvador Del Mundo, El Paisano and Cowboy, checked open October 1, 2026.',
  seo_keywords = array['highland park des moines restaurants','highland park food','where to eat highland park des moines','6th and euclid','chuck''s restaurant des moines','hiland bakery'],
  tags = array['Highland Park','restaurants','food crawl','north side','bakeries'],
  category = 'Food & Drink',
  content = $c$**Updated October 1, 2026.** Every place below was checked on that day against its own website, ordering page or a current listing for its address and a current menu. The earlier version of this guide listed restaurants that are closed or in other parts of the metro; they've been taken out.

A Highland Park food crawl starts at **6th and Euclid Avenues**, where three stops sit within a block of each other: **Cha Cha's Hiland Bakery** for doughnuts, **The Slow Down Coffee Co.** for coffee, and **Chuck's Restaurant** for an Italian-American dinner. For pupusas, drive or walk about ten minutes south on 6th Avenue to **El Salvador Del Mundo**. For Mexican food, two family restaurants sit east on Euclid Avenue, across the Des Moines River.

## About the district

The Highland Park Historic Business District covers about six acres at Euclid and Sixth Avenues, on the border of the Highland Park and Oak Park neighborhoods, roughly three miles north of downtown. Developers platted both neighborhoods in the late 1880s and ran a streetcar line north along Sixth Avenue. The brick commercial buildings date from the 1890s to after World War II, and the district was added to the National Register of Historic Places in 1998. For more on the area, see our [Highland Park neighborhood guide](/neighborhoods/highland-park).

## The crawl at a glance

| Stop | Address | Food | Distance from 6th & Euclid |
|---|---|---|---|
| Cha Cha's Hiland Bakery | 3615 6th Ave | Bakery | In the district |
| The Slow Down Coffee Co. | 3613 6th Ave | Coffee | In the district |
| Chuck's Restaurant | 3610 6th Ave | Italian-American | In the district |
| El Salvador Del Mundo | 2901 6th Ave | Salvadoran | About 0.7 mi south |
| El Paisano Mexican Food & Bakery | 901 E Euclid Ave | Mexican, panaderia | About 1.3 mi east |
| Cowboy Mexican Bar & Grill | 1234 E Euclid Ave | Mexican | About 1.6 mi east |

Distances are our estimates.

## In the district

### Cha Cha's Hiland Bakery

A neighborhood bakery whose family has been baking since 1946. The case includes a maple bacon doughnut, cinnamon rolls and a blueberry donut cheesecake. It opens early (5 am Tuesday-Friday on its own site, closed Monday), but the site also says hours will change soon, so check before you go.

- **Where:** 3615 6th Ave, Des Moines
- **Site:** [Hiland Bakery](https://sites.google.com/view/hilandbakery/home) | [Our listing](/restaurants/cha-chas-hiland-bakery)

### The Slow Down Coffee Co.

Next door to the bakery, and one of the few coffee shops in town open until 8 pm on weekdays.

- **Where:** 3613 6th Ave, Des Moines
- **Hours posted:** weekdays 6:30 am-8 pm, weekends 7 am-5 pm
- **Site:** [theslowdowndsm.com](https://theslowdowndsm.com/)

### Chuck's Restaurant

A long-running Italian-American dinner spot across the street, with chicken parmesan, fettuccine alfredo and its cheese logs.

- **Where:** 3610 6th Ave, Des Moines
- **Hours listed:** Tuesday-Saturday 5-9 pm

## A short drive south or east

### El Salvador Del Mundo

Salvadoran food on the 6th Avenue corridor. Pupusas start at $5.75 on its online ordering page, with shrimp pupusas and fried plantains also on the menu. Closed Tuesdays.

- **Where:** 2901 6th Ave, Des Moines

### El Paisano Mexican Food & Bakery

A family-owned Mexican restaurant with a panaderia, in the building on Euclid that used to house Vientiane. The menu has quesabirria tacos with consomme and grilled mojarra; the bakery case has conchas and tres leches.

- **Where:** 901 E Euclid Ave, Des Moines
- **Hours posted:** daily 9 am-9 pm
- **Site:** [elpaisanodsm.com](https://elpaisanodsm.com/)

### Cowboy Mexican Bar & Grill

A Mexican bar and grill further east on Euclid. The menu runs from two tacos and a side ($11.99) to a steak fajita ($18.99) and a coctel campechana ($32.99).

- **Where:** 1234 E Euclid Ave, Des Moines
- **Site:** [cowboygrilldsm.com](https://cowboygrilldsm.com/) | [Our listing](/restaurants/cowboy-mexican-bar-grill)

## What changed from the earlier version

- **Mi Patria**, the Ecuadorian restaurant in the earlier version, is in West Des Moines, not Highland Park.
- **Vientiane** at 901 E Euclid is gone; El Paisano operates at that address now.
- **Alegrias Seafood** at 2809 6th Ave is closed.

## Sources

Checked October 1, 2026:

- [Hiland Bakery](https://sites.google.com/view/hilandbakery/home) and its [Restaurantji listing](https://www.restaurantji.com/ia/des-moines/hiland-bakery-/)
- [The Slow Down Coffee Co.](https://theslowdowndsm.com/)
- [Chuck's Restaurant on Restaurantji](https://www.restaurantji.com/ia/des-moines/chucks-)
- [El Salvador Del Mundo online ordering](https://fromtherestaurant.com/el-salvador-del-mundo/) and its [Restaurantji listing](https://www.restaurantji.com/ia/des-moines/el-salvador-del-mundo-/)
- [El Paisano Mexican Food & Bakery](https://elpaisanodsm.com/)
- [Cowboy Mexican Bar & Grill](https://cowboygrilldsm.com/)
- [Highland Park Historic Business District at Euclid and Sixth Avenues](https://en.wikipedia.org/wiki/Highland_Park_Historic_Business_District_at_Euclid_and_Sixth_Avenues) (Wikipedia, drawing on the National Register nomination)
$c$,
  updated_at = now()
where id = '30f81e05-fe86-4276-a3f7-c767f2575431' and status = 'published';

-- 8c93a7d6-4231-431c-8f8b-2cf0846eb056 drake
update public.articles set
  title = 'Drake Neighborhood Food Guide: 7 Places to Eat Near Drake University',
  excerpt = 'Most places to eat near Drake University are on University Avenue between 23rd and 35th Streets. Here are seven, from Hugo''s Wood-Fired Kitchen to Gursha Ethiopian Grill and Drake Diner, each checked open on October 1, 2026.',
  seo_title = 'Restaurants Near Drake University: 7 Places to Eat',
  seo_description = 'Seven restaurants in the Drake neighborhood of Des Moines checked open on October 1, 2026: Hugo''s, Gursha, Mars Cafe, Lucky Horse, Drake Diner, Lzaza and University Library Cafe.',
  seo_keywords = array['restaurants near drake university','drake neighborhood restaurants','university avenue des moines restaurants','drake diner','mars cafe des moines','gursha ethiopian'],
  tags = array['Drake','restaurants','University Avenue','students'],
  category = 'Food & Drink',
  content = $c$**Updated October 1, 2026.** Every place below was checked on that day against its own website or a current listing for its address and a current menu. Restaurants from the earlier version of this guide that have closed or moved away were taken out.

Most of the places to eat near Drake University sit on one stretch of **University Avenue** between 23rd and 35th Streets, so you can walk between them. For a sit-down dinner, go to **Hugo's Wood-Fired Kitchen** for wood-fired pizza. For Ethiopian food, **Gursha Ethiopian Grill** serves doro wot on injera. For a diner breakfast or a burger, **Drake Diner** is a block off University on 25th Street.

## Drake neighborhood restaurants at a glance

| Place | Address | Food |
|---|---|---|
| Mars Cafe | 2318 University Ave | Coffee, panini, brunch |
| Gursha Ethiopian Grill | 2316 University Ave | Ethiopian |
| Lucky Horse Beer & Burgers | 2331 University Ave | Burgers, craft beer |
| Drake Diner | 1111 25th St | American diner |
| Hugo's Wood-Fired Kitchen | 3206 University Ave | Wood-fired pizza |
| Lzaza Indo-Pak Cuisine | 1409 23rd St | Halal Indian and Pakistani |
| University Library Cafe | 3506 University Ave | Bar and grill, brunch |

## The restaurants

### Mars Cafe

The coffeehouse most Drake students know, with panini and weekend brunch alongside the drinks. The menu includes a "Sputnik" drink, cold brew and a honey cinnamon latte.

- **Where:** 2318 University Ave, Des Moines
- **Hours listed:** weekdays 6 am-7 pm, weekends 7 am-7 pm (other listings show different hours, so check first)

### Gursha Ethiopian Grill

Ethiopian food next door to Mars Cafe. Doro wot and vegetable platters come on injera, and there are vegan options.

- **Where:** 2316 University Ave, Des Moines
- **Hours listed:** closed Monday; Tuesday-Thursday 11 am-7 pm, Friday-Saturday 7 am-8 pm, Sunday 7 am-6 pm

### Lucky Horse Beer & Burgers

A burger bar with a craft beer list. The menu runs from a prime rib burger to a falafel burger and cauliflower wings.

- **Where:** 2331 University Ave, Des Moines
- **Hours listed:** daily 11 am-10 pm

### Drake Diner

A diner a block off University Avenue. On the lunch menu the Maytag Burger was $16.49 and the French Dip $13.99.

- **Where:** 1111 25th St, Des Moines
- **Site:** [drakediner.com](https://drakediner.com/lunch/) | [Our listing](/restaurants/drake-diner)

### Hugo's Wood-Fired Kitchen

A wood-fired pizza kitchen with a Mediterranean lean. The Fig & Honey pizza ($17) comes with goat cheese, figs, arugula and pickled walnuts.

- **Where:** 3206 University Ave, Des Moines
- **Hours posted:** Tuesday-Saturday 11 am-9 pm
- **Site:** [hugosdsm.com](https://www.hugosdsm.com/)

### Lzaza Indo-Pak Cuisine

A halal Indian and Pakistani restaurant a block south of University Avenue. The menu includes butter chicken, garlic naan and gulab jamun.

- **Where:** 1409 23rd St, Des Moines
- **Hours listed:** Tuesday-Sunday 11 am-8:30 pm

### University Library Cafe

A bar and grill at the west end of the campus strip, with brunch dishes such as crab cakes Benedict and bar food such as cheeseburger nachos.

- **Where:** 3506 University Ave, Des Moines

## What changed from the earlier version

- **Gazali's Mediterranean Grill** moved from the neighborhood to Clive in 2021 and closed on February 15, 2024.
- **La Mie** has no "Express" location. Its bakery is at 841 42nd St in the Roosevelt area, outside the Drake neighborhood.
- **Jethro's BBQ** on Forest Avenue closed after a fire in February 2022, and **Papa Keno's** on University closed in June 2020.

## Sources

Checked October 1, 2026:

- [Drake Diner lunch menu](https://drakediner.com/lunch/)
- [Hugo's Wood-Fired Kitchen](https://www.hugosdsm.com/) and its [pizza menu](https://www.hugosdsm.com/wood-firedpizzas)
- [Mars Cafe on Restaurantji](https://www.restaurantji.com/ia/des-moines/mars-cafe-/)
- [Gursha Ethiopian Grill on Restaurantji](https://www.restaurantji.com/ia/des-moines/gursha-ethiopian-grill-/)
- [Lucky Horse Beer & Burgers on Restaurantji](https://www.restaurantji.com/ia/des-moines/lucky-horse-beer-and-burgers-/)
- [Lzaza Indo-Pak Cuisine on Restaurant Guru](https://restaurantguru.com/Lzaza-Indo-Pak-Cuisine-Des-Moines)
- [University Library Cafe on Restaurantji](https://www.restaurantji.com/ia/des-moines/university-library-cafe-/)
- [La Mie Bakery](https://lamiebakery.com/)
$c$,
  updated_at = now()
where id = '8c93a7d6-4231-431c-8f8b-2cf0846eb056' and status = 'published';

-- efff19a8-2943-4587-8afd-764118ed82f6 vj
update public.articles set
  title = 'Valley Junction Shops: Galleries, Makers and Gifts on 5th Street (2026)',
  excerpt = 'Most of Historic Valley Junction''s independent shops are on 5th Street in West Des Moines. Here are 12 galleries, maker shops and gift stores checked open on October 1, 2026, plus the fall event dates, starting with Gallery Night on October 9.',
  seo_title = 'Valley Junction Shops & Galleries: 2026 Guide',
  seo_description = '12 Valley Junction shops and galleries on 5th Street in West Des Moines, checked open October 1, 2026, plus fall dates: Gallery Night Oct 9, Sip and Shop, Pumpkin Walk and Jingle in the Junction.',
  seo_keywords = array['valley junction shops','valley junction west des moines','valley junction galleries','valley junction events 2026','gallery night valley junction','shopping west des moines'],
  tags = array['Valley Junction','West Des Moines','shopping','galleries','local makers'],
  category = 'Shopping',
  content = $c$**Updated October 1, 2026.** Every shop below was checked on that day against its own website or its listing in the Historic Valley Junction directory. The earlier version of this guide profiled fifteen "makers" we couldn't find any record of; this version lists only real shops at real addresses.

Historic Valley Junction is West Des Moines' old downtown, and most of its independent shops are on **5th Street**. For art made in the Midwest, start at **Olson-Larsen Galleries** and **Kavanaugh Art Gallery**. For something to make yourself, **Candle Bar DSM** lets you pour your own candle from more than 100 scents, and **The Iowa Quilt Block** and **Yarn Junction Co** sell supplies and run classes. The best night to visit this fall is **Gallery Night on Friday, October 9**.

## Valley Junction shops at a glance

| Shop | Address | What it sells |
|---|---|---|
| Kavanaugh Art Gallery | 228 5th St | Original paintings, sculpture, framing |
| Olson-Larsen Galleries | 542 5th St | Contemporary Midwest artists |
| Kunzler Studios & Gallery | 324 5th St | Local artwork and handmade goods |
| Bozz Prints | 215 5th St | Prints and cards designed in house |
| Candle Bar DSM | 130 5th St, Suite A | Pour-your-own candles |
| The Iowa Quilt Block | 325 5th St | Quilting fabric, machines, classes |
| Yarn Junction Co | 132 5th St | Yarn and knitting classes |
| Morrissey Fine Jewelry | 235 5th St | Jewelry and repairs |
| Happy DSM | 234 5th St | Gifts, candles, books |
| Reading in Public Bookstore + Cafe | 315 5th St | Books and coffee |
| Hinge | 317 5th St | Antiques, apparel, salvaged furniture |
| Corazon Coffee Roasters | 516 Elm St | Coffee roasted on site |

All addresses are in West Des Moines.

## Galleries and makers

### Olson-Larsen Galleries

A contemporary gallery open since 1979 that shows about 60 Midwest artists and does custom framing. Its next show opens on Gallery Night, October 9, 5-8 pm.

- **Hours posted:** Tuesday-Friday 11 am-5 pm, Saturday 11 am-4 pm
- **Site:** [olsonlarsen.com](https://olsonlarsen.com/)

### Kavanaugh Art Gallery

A family-owned gallery since 1987 with original paintings in oil, acrylic, watercolor and pastel, plus sculpture, limited-edition prints and archival framing.

- **Hours listed:** Monday-Saturday 10 am-5 pm
- **Site:** [kavanaughgallery.com](https://kavanaughgallery.com/)

### Kunzler Studios & Gallery

The directory lists Kunzler under makers and artisans: locally made artwork, handcrafted pieces and furniture and home goods.

- **Hours listed:** Tuesday-Saturday 10 am-5 pm

### Bozz Prints

Midwest and outdoors-themed art prints, cards, mugs, stickers and apparel, all designed in house in West Des Moines.

- **Site:** [bozzprints.com](https://bozzprints.com/) (its own site and the directory list slightly different hours)

### Candle Bar DSM

Pick a vessel, choose from more than 100 scents and pour your own candle. It also sells finished candles.

- **Hours posted:** Wednesday-Saturday 11 am-7 pm, Sunday 11 am-4 pm
- **Site:** [candlebardsm.com](https://candlebardsm.com/)

## Supplies and classes

### The Iowa Quilt Block

A fabric and quilt shop that's a dealer for BERNINA, Husqvarna Viking and Handi Quilter machines, with classes and longarm rental.

- **Hours listed:** Tuesday-Saturday 10 am-4 pm, Sunday 1-4 pm
- **Site:** [theiowaquiltblock.com](https://theiowaquiltblock.com/)

### Yarn Junction Co

A family-owned knitting shop that sells yarn and teaches classes.

## Gifts, books and jewelry

### Morrissey Fine Jewelry

A family-owned jeweler since 1974, with bridal pieces, colored gemstones and repairs.

- **Hours posted:** Thursday 10 am-3 pm, Friday 10 am-5:30 pm, Saturday 10 am-3 pm
- **Site:** [morrisseyfinejewelry.com](https://morrisseyfinejewelry.com/)

### Happy DSM

A woman-owned gift shop with candles, home decor, books, bath products and cards.

- **Hours posted:** Tuesday-Friday 10 am-5:30 pm, Saturday 10 am-5 pm, Sunday noon-4 pm
- **Site:** [happydsm.com](https://happydsm.com/)

### Reading in Public Bookstore + Cafe

An independent bookstore and cafe, Asian- and woman-owned.

- **Hours listed:** Monday-Saturday 9 am-6 pm, Sunday 10 am-4 pm

### Hinge

Antiques, apparel, home decor, jewelry, hats, scarves and salvaged furniture.

- **Hours listed:** Monday-Saturday 10 am-5 pm, Sunday noon-5 pm

### Corazon Coffee Roasters

A block off 5th Street, Corazon roasts organic, fair trade coffee. It's the place to stop between shops.

- **Hours posted:** Tuesday-Friday 10 am-5 pm, Saturday 10 am-2 pm
- **Site:** [corazoncoffeeroasters.com](https://corazoncoffeeroasters.com/)

## Fall and holiday events

The Valley Junction events page lists these dates. It doesn't print a year, but the weekdays match 2026, and Olson-Larsen's site confirms the October 9 Gallery Night.

- **Gallery Night:** Friday, October 9
- **Sip and Shop:** Thursdays, October 15, 22 and 29
- **Pumpkin Walk:** Sunday, October 25
- **Jingle in the Junction:** Thursday, November 19, and Thursdays, December 3, 10 and 17
- **Small Business Weekend:** starts Friday, November 27

The Thursday farmers market ran May through September and is over for 2026. For more around town, see the [October 2026 events calendar](/events/october-2026).

## Sources

Checked October 1, 2026:

- [Historic Valley Junction](https://www.valleyjunction.com/), its [events page](https://www.valleyjunction.com/upcoming-events/) and [farmers market page](https://www.valleyjunction.com/farmers-market/)
- Valley Junction directory listings for [Kunzler Studios](https://www.valleyjunction.com/listings/kunzler-studios/), [Yarn Junction Co](https://www.valleyjunction.com/listings/yarn-junction-co/), [Reading in Public](https://www.valleyjunction.com/listings/reading-in-public-bookstore-cafe/) and [Hinge](https://www.valleyjunction.com/listings/hinge/)
- [Olson-Larsen Galleries](https://olsonlarsen.com/)
- [Kavanaugh Art Gallery](https://kavanaughgallery.com/)
- [Bozz Prints](https://bozzprints.com/)
- [Candle Bar DSM](https://candlebardsm.com/)
- [The Iowa Quilt Block](https://theiowaquiltblock.com/)
- [Morrissey Fine Jewelry](https://morrisseyfinejewelry.com/)
- [Happy DSM](https://happydsm.com/)
- [Corazon Coffee Roasters](https://corazoncoffeeroasters.com/)
$c$,
  updated_at = now()
where id = 'efff19a8-2943-4587-8afd-764118ed82f6' and status = 'published';

-- 45a5b15a-ec01-4e0b-af45-2e11b90b23cc history
update public.articles set
  title = 'Des Moines History: 10 Historic Places You Can Visit',
  excerpt = 'For one afternoon of Des Moines history, visit the Iowa State Capitol and the State Historical Museum, which sit side by side and are both free. Here are ten historic places with the hours and prices each one posted on October 1, 2026.',
  seo_title = 'Historic Places to Visit in Des Moines: 10 Sites',
  seo_description = 'Ten historic places in Des Moines with 2026 hours and prices from their own sites: the State Capitol, Terrace Hill, Salisbury House, Hoyt Sherman Place, Fort Des Moines Museum, Jordan House and more.',
  seo_keywords = array['des moines history','historic sites des moines','things to do des moines history','terrace hill tours','iowa state capitol tour','fort des moines museum','jordan house underground railroad'],
  tags = array['history','museums','historic homes','attractions','tours'],
  category = 'History',
  content = $c$**Updated October 1, 2026.** Every fact, hour and price below comes from the site's own web page (or the state or city page that runs it) as it read on that day. The earlier version of this guide named places we couldn't find any record of; they've been taken out.

If you have one afternoon for Des Moines history, spend it on the east side of the river: the **Iowa State Capitol** and the **State Historical Museum of Iowa** are next to each other and both are free. If you can plan ahead, book a tour of **Terrace Hill**, the governor's residence, which takes reservations at least 48 hours out. For the city's Black history, the **Fort Des Moines Museum** tells the story of the 1917 camp that trained Black officers for World War I, and the **Jordan House** in West Des Moines interprets the Underground Railroad.

## Historic sites at a glance

| Site | Town | Built or founded | Visiting | Price |
|---|---|---|---|---|
| Iowa State Capitol | Des Moines | 1871-1886 | Mon-Sat | Free |
| State Historical Museum of Iowa | Des Moines | n/a | Tue-Sat | Free |
| Terrace Hill | Des Moines | 1866-1869 | Guided tours Tue-Sat, Mar-Dec | $5 adults |
| Salisbury House & Gardens | Des Moines | 1920s | Posted week by week | $12 self-guided |
| Hoyt Sherman Place | Des Moines | 1877 | Call for tours | Ask |
| Sherman Hill Historic District | Des Moines | Platted 1877-1882 | Any time, from the street | Free |
| Woodland Cemetery | Des Moines | n/a | Grounds daily; guided tours by reservation | Tours $10 |
| Jordan House | West Des Moines | n/a | Fri and Sun | $5 |
| Fort Des Moines Museum | Des Moines | 1917 camp | Call ahead | Ask |
| Living History Farms | Urbandale | n/a | Tue-Sat 9-4 | See site |

## Downtown and the east side

### Iowa State Capitol

Construction began in 1871. The first foundation stone was waterlogged and crumbled, and the stone laid in its place reads "IOWA. A.D. 1873". The building was finished in 1886 for $2,873,294.59. The 23-karat gold dome rises 275 feet.

- **Where:** 1007 E Grand Ave, Des Moines
- **Visiting:** free guided tours Monday-Saturday; call 515-281-5591 for times. The building is open Monday-Friday 8 am-4:45 pm and Saturday 8 am-3:45 pm.
- **Source:** [Iowa Legislature: Tour the Capitol](https://www.legis.iowa.gov/resources/tourCapitol) and the [Capitol visitor guide (PDF)](https://www.legis.iowa.gov/docs/publications/IF/793559.pdf)

### State Historical Museum of Iowa

The state's history museum, just west of the Capitol in the State Historical Building. It holds more than 80,000 artifacts, about 1,500 of them on display.

- **Where:** 600 E Locust St, Des Moines
- **Visiting:** Tuesday-Friday 9 am-4:30 pm, Saturday 9 am-3 pm; closed Sunday and Monday. Admission is free.
- **Source:** [State Historical Society of Iowa](https://history.iowa.gov/visit/state-historical-museum-iowa)

### Fort Des Moines Museum & Education Center

The site of the 1917 training camp for Black officers in World War I, and the place where the Women's Army Auxiliary Corps was established in 1942. It's a National Historic Landmark district.

- **Where:** 75 E Army Post Rd, Des Moines
- **Visiting:** the museum's site still shows hours labelled "Winter 2024" (Saturdays, roughly 10 am-4 pm). Call 515-400-3678 before you go.
- **Source:** [fortdesmoinesmuseum.com](https://www.fortdesmoinesmuseum.com/)

## Grand Avenue and the west side

### Terrace Hill

Built from 1866 to 1869 for Benjamin Franklin Allen and later owned by F.M. Hubbell, Terrace Hill is now the Iowa Governor's Residence and a National Historic Landmark.

- **Where:** 2300 Grand Ave, Des Moines
- **Visiting:** guided tours only, March through December, Tuesday-Saturday at 10:30 am and noon (plus 1:30 pm in December). Book at least 48 hours ahead at 515-281-7205. Adults $5, ages 6-12 $2, 5 and under free; cash or check only.
- **Source:** [terracehill.iowa.gov/visit](https://terracehill.iowa.gov/visit)

### Salisbury House & Gardens

Built in the 1920s by cosmetics businessman Carl Weeks and his wife Edith, and modelled on Salisbury, England. Inside is 16th-century English oak woodwork.

- **Where:** 4025 Tonawanda Dr, Des Moines
- **Visiting:** hours are posted one week at a time. For September 28-October 4 they were Wednesday, Thursday and Sunday, noon-5 pm, with last entry an hour before close. Self-guided $12, guided $17.
- **Source:** [salisburyhouse.org/visit](https://www.salisburyhouse.org/visit)

### Hoyt Sherman Place

Hoyt Sherman finished the family home in 1877. The complex now includes the mansion, a theater and what it calls Des Moines' first art gallery.

- **Where:** 1501 Woodland Ave, Des Moines
- **Visiting:** the site offers guided group tours and self-guided tours but posts no schedule. Call the box office (515-244-0507, weekdays 10 am-5 pm).
- **Source:** [hoytsherman.org](https://hoytsherman.org/)

### Sherman Hill Historic District

A neighborhood of Queen Anne, Italianate and Eastlake houses around 15th Street and Woodland Avenue. Hoyt Sherman bought the land in 1850, and most of it was platted from 1877 to 1882. It went on the National Register in 1979 and became Des Moines' first local historic district in 1982. You can walk the streets any time; the houses are private.

- **Source:** [Sherman Hill Association: history](https://www.shermanhilldsm.org/history/)

### Woodland Cemetery

The city-run cemetery where many of Des Moines' pioneers and Civil War veterans are buried.

- **Where:** 2019 Woodland Ave, Des Moines
- **Visiting:** grounds open 6 am-6 pm September-March and 6 am-8 pm April-August. Two-hour guided walking tours are $10 per person, by reservation.
- **Source:** [City of Des Moines: Woodland Cemetery](https://www.dsm.city/Woodland_Cemetery329.php)

## Suburbs

### Jordan House

A Victorian house on the National Register and part of the National Underground Railroad Network to Freedom. It tells the story of James C. Jordan and the people who escaped slavery through West Des Moines.

- **Where:** 2001 Fuller Rd, West Des Moines
- **Visiting:** Friday and Sunday, 11 am-12:30 pm and 1:30-3 pm. $5, 5 and under free.
- **Source:** [West Des Moines Historical Society](https://www.wdmhs.org/visit)

### Living History Farms

A 500-acre outdoor museum with a 1700 Ioway farm, an 1850 pioneer farm, the 1876 town of Walnut Hill and a 1900 horse-powered farm.

- **Where:** 11121 Hickman Rd, Urbandale
- **Visiting:** Tuesday-Saturday 9 am-4 pm, last tractor cart at 2:30 pm. Prices weren't posted on the pages we read; call 515-278-5286.
- **Source:** [lhf.org](https://www.lhf.org/visit/)

## What changed from the earlier version

The earlier version described a "Green Hat Club" and a set of Court Avenue speakeasies. We found no source for either and they're gone. It also sent readers to restaurants and a brewery that have since closed.

## Sources

Checked October 1, 2026:

- [Iowa Legislature: Tour the Capitol](https://www.legis.iowa.gov/resources/tourCapitol)
- [Iowa State Capitol visitor guide (PDF)](https://www.legis.iowa.gov/docs/publications/IF/793559.pdf)
- [State Historical Museum of Iowa](https://history.iowa.gov/visit/state-historical-museum-iowa)
- [Terrace Hill](https://terracehill.iowa.gov/) and its [visit page](https://terracehill.iowa.gov/visit)
- [Salisbury House & Gardens](https://www.salisburyhouse.org/visit)
- [Hoyt Sherman Place](https://hoytsherman.org/)
- [Sherman Hill Association: history](https://www.shermanhilldsm.org/history/)
- [City of Des Moines: Woodland Cemetery](https://www.dsm.city/Woodland_Cemetery329.php)
- [West Des Moines Historical Society: visit](https://www.wdmhs.org/visit)
- [Fort Des Moines Museum](https://www.fortdesmoinesmuseum.com/)
- [Living History Farms](https://www.lhf.org/visit/)
$c$,
  updated_at = now()
where id = '45a5b15a-ec01-4e0b-af45-2e11b90b23cc' and status = 'published';

-- c7188aa8-25ba-45a2-9067-98073730c0b7 budget
update public.articles set
  title = 'Free and Cheap Things to Do in Des Moines This Fall (2026)',
  excerpt = 'The best free afternoon in Des Moines this fall is the Des Moines Art Center, where admission is always free, then the Pappajohn Sculpture Park. Here are 12 free and low-cost things to do, with the prices and hours each posted on October 1, 2026.',
  seo_title = 'Free & Cheap Things to Do in Des Moines, Fall 2026',
  seo_description = '12 free and low-cost things to do in Des Moines this fall with prices from official sites: Art Center, Sculpture Park, Capitol tours, farmers markets, Jester Park, High Trestle Trail and more.',
  seo_keywords = array['free things to do des moines','cheap things to do des moines','des moines on a budget','free museums des moines','fall activities des moines','des moines farmers market 2026'],
  tags = array['free','budget','fall activities','museums','parks'],
  category = 'Attractions',
  content = $c$**Updated October 1, 2026.** Every price, hour and date below comes from the venue's own page (or the city, county or state page that runs it) as it read on that day. The earlier version of this guide called the Botanical Garden free and gave the Neal Smith Trail the wrong length; both are corrected here.

The best free afternoon in Des Moines this fall is the **Des Moines Art Center** on Grand Avenue, where admission is always free, followed by a walk through the **Pappajohn Sculpture Park** downtown. On a Saturday in October, the **Downtown Farmers' Market** runs 8 am to noon through October 31. For time outside the city, **Jester Park** north of Granger has free admission to its nature center and an elk and bison exhibit.

For more ideas on a budget, see our [budget things-to-do page](/things-to-do/budget) and the [free events calendar](/events/free).

## Free and cheap at a glance

| What | Where | Price |
|---|---|---|
| Des Moines Art Center | 4700 Grand Ave | Free |
| Pappajohn Sculpture Park | 1330 Grand Ave | Free |
| Iowa State Capitol tours | 1007 E Grand Ave | Free |
| State Historical Museum of Iowa | 600 E Locust St | Free |
| Robert D. Ray Asian Garden | Des Moines | Free |
| Downtown Farmers' Market | Historic Court District | No admission |
| Downtown Winter Farmers' Market | 400 Locust St | Free admission |
| Jester Park Nature Center | Granger | Free |
| High Trestle Trail | Woodward to Ankeny | Free |
| Central Library | 1000 Grand Ave | Free programs |
| Greater Des Moines Botanical Garden | Des Moines | $14 adults |
| Brenton Skating Plaza | 520 Robert D. Ray Dr | $12 adults |

## Free museums and landmarks

### Des Moines Art Center

The Art Center's visit page says plainly that "admission is always free," and parking on site is free too.

- **Where:** 4700 Grand Ave, Des Moines
- **Hours posted:** closed Monday; Tuesday-Wednesday 10 am-4 pm, Thursday-Friday 10 am-7 pm, Saturday-Sunday 10 am-5 pm
- **Source:** [desmoinesartcenter.org/visit](https://desmoinesartcenter.org/visit/)

### Pappajohn Sculpture Park

The Art Center's downtown sculpture park, open on city park hours, sunrise to midnight. Guided tours run through October 31 and need three weeks' notice.

- **Where:** 1330 Grand Ave, Des Moines
- **Source:** [Pappajohn Sculpture Park](https://desmoinesartcenter.org/visit/pappajohn-sculpture-park/)

### Iowa State Capitol

Free guided and self-guided tours of the gold-domed Capitol. Call 515-281-5591 for guided tour times.

- **Where:** 1007 E Grand Ave, Des Moines
- **Hours posted:** Monday-Friday 8 am-4:45 pm, Saturday 8 am-3:45 pm
- **Source:** [Iowa Legislature: Tour the Capitol](https://www.legis.iowa.gov/resources/tourCapitol)

### State Historical Museum of Iowa

"Admission to the museum and research center is free."

- **Where:** 600 E Locust St, Des Moines
- **Hours posted:** Tuesday-Friday 9 am-4:30 pm, Saturday 9 am-3 pm; closed Sunday and Monday
- **Source:** [State Historical Museum of Iowa](https://history.iowa.gov/visit/state-historical-museum-iowa)

### Central Library

The downtown library lists free fall programs and gives two hours of free underground parking. Sunday hours end for the season on October 25.

- **Where:** 1000 Grand Ave, Des Moines
- **Hours posted:** Monday-Thursday 9 am-8 pm, Friday 9 am-6 pm, Saturday 10 am-5 pm
- **Source:** [Des Moines Public Library: Central](https://www.dmpl.org/locations-hours/central)

## Markets

### Downtown Farmers' Market

Twelve blocks of vendors in the Historic Court District every Saturday. The 2026 season ends October 31, and October hours are 8 am to noon.

- **Source:** [Des Moines Downtown Farmers' Market](https://www.dsmpartnership.com/desmoinesfarmersmarket/)

### Downtown Winter Farmers' Market

A three-day indoor market at Capital Square with free admission and food trucks on Cowles Commons. 2026 dates: Friday, November 20 (10 am-2 pm), Saturday, November 21 (8 am-4 pm) and Sunday, November 22 (10 am-2 pm).

- **Where:** Capital Square, 400 Locust St, Des Moines
- **Source:** [Downtown Winter Farmers' Market](https://www.dsmpartnership.com/desmoinesfarmersmarket/winter-market)

## Outdoors

### Jester Park Nature Center

Polk County's page says admission to Jester Park and the Nature Center is free. The park has an elk and bison exhibit.

- **Where:** 12130 NW 128th St, Granger
- **Hours posted:** Monday-Friday 9 am-4 pm, Saturday 10 am-4 pm, Sunday noon-4 pm; closed Thanksgiving and Veterans Day
- **Source:** [Polk County Conservation: Jester Park Nature Center](https://www.polkcountyiowa.gov/conservation/things-to-do/jester-park-nature-center/)

### High Trestle Trail

A 25-mile trail between Woodward and Ankeny with a half-mile bridge that stands 13 stories high. The bridge is lit from sunset to midnight in October and sunset to 9 pm from November.

- **Source:** [Iowa Natural Heritage Foundation: High Trestle Trail](https://www.inhf.org/what-we-do/protection/high-trestle-trail)

### Gray's Lake Park and the Neal Smith Trail

Gray's Lake is a 166.6-acre city park with a walking path and a bike trail. The Neal Smith Trail runs 24.8 miles from downtown north toward Saylorville and Big Creek. Neither page lists a fee.

- **Where:** Gray's Lake Park, 2101 Fleur Dr, Des Moines
- **Sources:** [City of Des Moines parks directory](https://www.dsm.city/departments/parks_recreation/parks/directory.php) and the [Iowa By Trail map of the Neal Smith Trail (PDF)](https://www.iowabytrail.com/webres/File/trail-map-pdfs/Iowa%20By%20Trail%20%E2%80%93%20Neal%20Smith%20Trail.pdf)

## Low-cost

### Greater Des Moines Botanical Garden

Not free: adults are $14, seniors and military $13, children 2-12 $10, with free entry for up to four people on SNAP or WIC. The Robert D. Ray Asian Garden, listed on the same page, is free to all, 6 am-10 pm daily.

- **Fall hours posted:** September 30-November 12, Tuesday-Friday 10 am-5 pm and Saturday-Sunday 9 am-4 pm; closed Mondays
- **Source:** [Botanical Garden tickets](https://dmbotanicalgarden.com/tickets/)

### Brenton Skating Plaza

The downtown outdoor rink opens in November, weather permitting (it closes when it's above 65 degrees). Adults $12, ages 6-12 and seniors $8, skate rental $6. Des Moines residents get $2 off admission and $1 off rentals.

- **Where:** 520 Robert D. Ray Dr, Des Moines
- **Source:** [City of Des Moines: Brenton Skating Plaza](https://www.dsm.city/departments/parks_recreation/brenton_skating_plaza/index.php)

## Sources

Checked October 1, 2026:

- [Des Moines Art Center: visit](https://desmoinesartcenter.org/visit/)
- [Pappajohn Sculpture Park](https://desmoinesartcenter.org/visit/pappajohn-sculpture-park/)
- [Iowa Legislature: Tour the Capitol](https://www.legis.iowa.gov/resources/tourCapitol)
- [State Historical Museum of Iowa](https://history.iowa.gov/visit/state-historical-museum-iowa)
- [Des Moines Public Library: Central](https://www.dmpl.org/locations-hours/central)
- [Des Moines Downtown Farmers' Market](https://www.dsmpartnership.com/desmoinesfarmersmarket/) and [Winter Market](https://www.dsmpartnership.com/desmoinesfarmersmarket/winter-market)
- [Polk County Conservation: Jester Park Nature Center](https://www.polkcountyiowa.gov/conservation/things-to-do/jester-park-nature-center/)
- [Iowa Natural Heritage Foundation: High Trestle Trail](https://www.inhf.org/what-we-do/protection/high-trestle-trail)
- [City of Des Moines parks directory](https://www.dsm.city/departments/parks_recreation/parks/directory.php)
- [Iowa By Trail: Neal Smith Trail (PDF)](https://www.iowabytrail.com/webres/File/trail-map-pdfs/Iowa%20By%20Trail%20%E2%80%93%20Neal%20Smith%20Trail.pdf)
- [Greater Des Moines Botanical Garden: tickets](https://dmbotanicalgarden.com/tickets/)
- [City of Des Moines: Brenton Skating Plaza](https://www.dsm.city/departments/parks_recreation/brenton_skating_plaza/index.php)
$c$,
  updated_at = now()
where id = 'c7188aa8-25ba-45a2-9067-98073730c0b7' and status = 'published';

-- Retire the seven with no search impressions in the last three months.
update public.articles
set status = 'archived'
where id in ('60300bff-9207-400e-bb21-2d24005fcc96',
             '61b50b5a-1b80-41ce-a260-339bf321beb8',
             '3c44b627-7eef-4ab9-839e-cc5e40760453',
             'e91f446a-da77-4a45-ad32-d4c9a7c567ce',
             'e0bb35fb-ef93-4528-8231-d52088465684',
             'b09f2d56-b58b-4b24-9ee0-18c81faa51f4',
             'aaabb005-7bfb-47d2-8625-00df9836a215')
  and status = 'published';

select left(slug, 60) as slug, status, word_count, published_at::date, updated_at::date,
       public.article_body_problem(content) as body_problem
from public.articles
where published_at < '2026-01-01' and status in ('published', 'archived')
order by status, slug;

commit;
