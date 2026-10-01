-- SEO-032: Halloween-season articles, published to production 2026-09-30.
--
-- This file is the exact content written to public.articles. Every date, hour
-- and price below was read from the venue's own web page on 2026-09-30 (URLs in
-- each article's Sources list). Drive times are estimates.
--
-- 1. UPDATE  8b366313-... best-pumpkin-patches-in-the-des-moines-area-your-complete-fall-guide
--    (last year's pumpkin patch URL, refreshed in place; backup in
--    scripts/content-backups/seo-032/). Normal triggers run; the publish webhook does
--    not fire because the row was already published.
-- 2. INSERT  haunted-houses-near-des-moines
-- 3. INSERT  corn-mazes-near-des-moines
--    Inserted with session_replication_role = replica so the publish webhook
--    (AI social-post generation) does not fire; nobody asked for social posts.
--    That also skips the slug, word-count and sitemap-queue triggers, so the
--    slug and word_count are set here and the sitemap_change_queue rows are
--    written by hand.
--
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/seo-032-halloween-articles.sql

begin;

-- 1. Pumpkin patches and apple orchards (refresh) ---------------------------
update public.articles set
  title = 'Pumpkin Patches and Apple Orchards Near Des Moines (2026)',
  excerpt = 'The closest pumpkin patch to downtown is Iowa Orchard in Urbandale, about 15 minutes out, with no entry fee to pick pumpkins. For a full farm day, Howell''s in Cumming and Center Grove Orchard in Cambridge have the most to do. Here are eight farms with their 2026 dates, hours and prices.',
  seo_title = 'Pumpkin Patches & Apple Orchards Near Des Moines 2026',
  seo_description = 'Eight pumpkin patches and apple orchards near Des Moines with 2026 dates, hours and prices from each farm''s own site: Howell''s, Center Grove, Iowa Orchard, Wills, Deal''s and more.',
  seo_keywords = array['pumpkin patch des moines','pumpkin patches near des moines','apple orchards near des moines','apple picking des moines','pumpkin patch 2026','center grove orchard','howells pumpkin patch','iowa orchard urbandale'],
  tags = array['pumpkin patches','apple orchards','fall activities','family attractions','corn mazes','Iowa farms'],
  category = 'Attractions',
  content = $c$**Updated September 30, 2026.** Every date, hour and price here comes from the farm's own website as it read on that day. Drive times from downtown Des Moines are our estimates.

If you want a pumpkin without a big day out, go to **Iowa Orchard** in Urbandale: about 15 minutes from downtown, no entry fee for the pumpkin patch, and pumpkins sold by the pound. If you want a whole afternoon of wagon rides, slides and a corn maze, **Howell's** in Cumming and **Center Grove Orchard** in Cambridge are the two biggest operations within 40 minutes. For apple picking, Iowa Orchard, Center Grove and Deal's Orchard all run u-pick.

For everything else happening this month, see the [October 2026 events calendar](/events/october-2026).

## Pumpkin patches and orchards at a glance

| Farm | Town | Drive (est.) | Pumpkins | Apples | Admission |
|---|---|---|---|---|---|
| Iowa Orchard | Urbandale | 15 min NW | Yes | U-pick | Free for pumpkins; $5 u-pick |
| Wilson's Orchard & Farm | Cumming | 20 min SW | Yes | Yes | Check the site |
| Howell's | Cumming | 20-25 min SW | Yes | No | $14 online, $18 gate |
| Pumpkinville | Mitchellville | 20-25 min E | Yes | No | No general admission |
| Wills Family Orchard | Adel | 30 min W | Yes | Yes | $12 activity pass |
| Center Grove Orchard | Cambridge | 35 min N | Yes | U-pick | $14.95-$23.95 |
| Berry Patch Farm | Nevada | 40 min N | Yes | Yes | Check the site |
| Deal's Orchard | Jefferson | 60-70 min NW | Yes | U-pick | $12.95 online, $14.95 gate |

## The farms

### Iowa Orchard (Urbandale)

A family orchard on the northwest edge of the metro with a farm market, u-pick apples and a pumpkin patch.

- **Where:** Farm market and pumpkin patch at 9875 Meredith Drive, Urbandale. The u-pick apples page lists 13140 NW 102nd Avenue, Granger as the u-pick location. About 15 minutes northwest of downtown.
- **Pumpkin patch:** Tuesday through Sunday, 9 am to 6 pm, late September through Halloween. No entry fee; pumpkins are $0.50 a pound.
- **U-pick apples:** Labor Day weekend through mid-October, 9 am to 5 pm Tuesday through Sunday, last admittance 4 pm, closed Mondays. Admission is $5 per person (under 2 free). Apples run $13 a half peck to $66 a bushel; Honeycrisp and EverCrisp are $19 to $95.
- **Family Fun Zone:** Saturdays and Sundays, 10 am to 5 pm, late September through October, $5 per person.
- The site doesn't put a year on these pages, and it says hours change with weather and ripening and that closings go out on its Facebook page. Check before you drive.
- **Site:** [iowaorchard.com](https://www.iowaorchard.com/)

### Howell's Greenhouse & Pumpkin Patch (Cumming)

A greenhouse that turns into a full fall farm, with wagon rides, an 8-acre corn maze, pedal go-karts and a playground included in admission.

- **Where:** 3145 Howell Court, Cumming. About 20-25 minutes southwest of downtown.
- **2026 season:** September 12 through November 1. Hours in September and October are 10 am to 6 pm.
- **Price:** $14 per person online (plus fees) or $18 plus tax at the gate, for everyone 2 and older. Seniors 65+ and military (ID required) are $12 plus tax. A fall season pass is $45.
- **Included:** the farm activity area, goats, flower fields, wagon rides, the corn maze and the playground. Pony rides and the paintball range cost extra. The farm market and gift shop need no admission.
- **2026 events:** Howellween on Saturday, October 31, and Pumpkin Smash on November 1.
- **Site:** [howellsgreenhouseandpumpkinpatch.com](https://howellsgreenhouseandpumpkinpatch.com/admission/)

### Center Grove Orchard (Cambridge)

The biggest fall farm north of the metro: u-pick apples, a pumpkin patch, a four-acre corn maze, jumping pillows and a train, all on one ticket.

- **Where:** 32835 610th Avenue, Cambridge. The farm says it's 35 minutes from Des Moines.
- **2026 season:** August 29 through November 8. The 2026 calendar lists 9 am to 7 pm daily, closed Tuesdays, with 9 am to 9 pm on October 2-3, 9-10, 16-17 and 23-24.
- **Price (age 3+):** online $14.95 weekday or $19.95 weekend, plus tax; at the gate $16.95 weekday or $23.95 weekend. Thursdays after 2 pm are buy one, get one free at the gate. Fall season pass $69.95.
- **Apples:** u-pick runs $9.95 for a quarter peck to $64.95 a bushel, and admission is required to enter the orchard. The apples page doesn't list a year, so confirm prices at the gate.
- **Pumpkins:** pumpkin picking runs late September through October and is included with admission.
- **Event page:** [Pumpkin Fest at Center Grove Orchard](/events/pumpkin-fest-2026-10-01)
- **Site:** [centergroveorchard.com](https://centergroveorchard.com/pages/buy-tickets)

### Wills Family Orchard (Adel)

A weekend apple and pumpkin festival west of the metro with a corn maze, low ropes course, pedal tractors and hay wagon rides.

- **Where:** 33130 Panther Creek Road, Adel. About 30 minutes west of downtown.
- **2026 festival weekends:** September 12-13, 19-20 and 26-27; October 3-4, 10-11, 17-18 and 24-25. Saturdays 9 am to 6 pm, Sundays noon to 6 pm.
- **Price:** activity pass $12 per person plus tax; children 2 and under are free. The pass covers ten activities including the corn maze and hay wagon ride.
- **Site:** [willsfamilyorchard.com](https://willsfamilyorchard.com/apple-and-pumpkin-fest/)

### Wilson's Orchard & Farm (Cumming)

The Des Moines location of the Iowa City orchard: a 125-acre farm with you-pick crops, a farm market, a bakery and a cider bar and restaurant.

- **Where:** 3201 15th Avenue, Cumming. About 20 minutes southwest of downtown.
- **Hours:** the farm, market and farmyard are listed as closed Monday and Tuesday and open Wednesday through Sunday, 9 am to 9 pm. The page didn't show 2026 dates or prices when we checked, so check the site for 2026 hours and prices.
- **Site:** [wilsonsorchard.com/des-moines](https://wilsonsorchard.com/des-moines)

### Pumpkinville and Cornmaze (Mitchellville)

A pumpkin farm east of Altoona with no general admission fee; you pay for pumpkins and for the big corn maze.

- **Where:** 618 Center Ave South, Mitchellville. About 20-25 minutes east of downtown.
- **Hours:** closed Mondays; Tuesday through Thursday and Sunday 10 am to 7 pm; Friday and Saturday 10 am to 8 pm. Pumpkins and decorations are September through October.
- **Price:** no general admission. Pumpkins and gourds are $1 to $30; corn shocks $5.
- **Site:** [pumpkinvillecornmaze.com](https://pumpkinvillecornmaze.com/prices)

### Berry Patch Farm (Nevada)

A farm east of Ames with apples, pumpkins and hayrack rides in the fall.

- **Where:** 62785 280th Street, Nevada. About 40 minutes north of downtown.
- **Hours:** the site lists Monday through Saturday, 8 am to 6 pm. It doesn't list 2026 fall dates or prices, so check the site for 2026 hours.
- **Site:** [berrypatchfarm.com](https://berrypatchfarm.com/)

### Deal's Orchard (Jefferson)

A family orchard since 1917 with an apple barn, a pumpkin patch and a play area called Apple Acres that includes a corn maze.

- **Where:** 1102 244th Street, Jefferson. About an hour or a little more northwest of downtown, the longest drive on this list.
- **2026 season:** August 29 through November 1, 9 am to 6 pm daily, weather permitting.
- **Price:** Apple Acres is $12.95 online or $14.95 at the gate; 65+ is $6.95 online or $7.95 at the gate; 2 and under free. The farm says there's no charge to visit the Apple Barn or the pumpkin patch, listen to live music or take a weekend hayride.
- **Site:** [dealsorchard.com](https://dealsorchard.com/)

## Tips before you go

- **Buy online at the big farms.** Howell's saves you $4 a head online; Center Grove saves $2 on weekdays and $4 on weekends.
- **Go on a weekday or a Thursday.** Center Grove's gate price drops by $7 Monday through Friday, and Thursdays after 2 pm are two-for-one.
- **Pumpkins only?** Iowa Orchard, Pumpkinville and the Deal's pumpkin patch don't charge admission to buy pumpkins.

## More October plans

- [Corn mazes near Des Moines](/articles/corn-mazes-near-des-moines)
- [Haunted houses near Des Moines](/articles/haunted-houses-near-des-moines)
- [Farmstasia at Living History Farms](/events/farmstasia-2026-2026-10-02)
- [Family Halloween at Living History Farms](/events/family-halloween-2026-10-23)
- [October 2026 events in Des Moines](/events/october-2026)

## Sources

All fetched September 30, 2026.

- Iowa Orchard: [home](https://www.iowaorchard.com/), [u-pick apples](https://www.iowaorchard.com/u-pick-apples/), [tours and activities](https://www.iowaorchard.com/iowa-orchard-tours-and-activities/)
- Howell's: [admission](https://howellsgreenhouseandpumpkinpatch.com/admission/), [events](https://howellsgreenhouseandpumpkinpatch.com/events/)
- Center Grove Orchard: [tickets](https://centergroveorchard.com/pages/buy-tickets), [calendar](https://centergroveorchard.com/pages/calendar), [u-pick apples](https://centergroveorchard.com/pages/you-pick/apples)
- Wills Family Orchard: [Apple and Pumpkin Fest](https://willsfamilyorchard.com/apple-and-pumpkin-fest/)
- Wilson's Orchard & Farm: [Des Moines](https://wilsonsorchard.com/des-moines)
- Pumpkinville and Cornmaze: [home](https://pumpkinvillecornmaze.com/), [prices](https://pumpkinvillecornmaze.com/prices), [hours](https://pumpkinvillecornmaze.com/hours)
- Berry Patch Farm: [home](https://berrypatchfarm.com/)
- Deal's Orchard: [home](https://dealsorchard.com/), [Apple Acres 2026 tickets](https://dealsorchard.ticketspice.com/apple-acres-2026)
$c$
where id = '8b366313-fc1a-49e0-9505-dbb9852547f4';

-- 2 and 3. New articles; triggers off for these two inserts only ------------
set local session_replication_role = replica;

insert into public.articles (
  title, slug, content, excerpt, author_id, status, category, tags,
  seo_title, seo_description, seo_keywords, published_at, created_at, updated_at, word_count
)
select v.title, v.slug, v.content, v.excerpt,
  '60ff90c2-d66d-407c-ba18-4462188c9b7b', 'published', 'Attractions', v.tags,
  v.seo_title, v.seo_description, v.seo_keywords, now(), now(), now(),
  array_length(regexp_split_to_array(btrim(v.content), '\s+'), 1)
from (values
(
  'Haunted Houses Near Des Moines (2026)',
  'haunted-houses-near-des-moines',
  $c$**Updated September 30, 2026.** Every date, hour and price here comes from the attraction's own website as it read on that day. Drive times from downtown Des Moines are our estimates.

Four haunted attractions open within 20 minutes of downtown Des Moines this October. **The Slaughterhouse** is downtown and opens Friday, October 2. **Linn's Haunted House** is the old-school pick, $25 at the door. **Sleepy Hollow Haunted Scream Park** is the biggest night out, with several haunts on one ticket. **County Line Road Haunted Woods** in Carlisle is the outdoor one.

For everything else on the calendar, see the [October 2026 events calendar](/events/october-2026).

## Haunted houses at a glance

| Attraction | Town | Drive (est.) | Opens | Price |
|---|---|---|---|---|
| The Slaughterhouse | Downtown Des Moines | 5 min | Oct 2 | From $25 |
| Linn's Haunted House | Des Moines (north side) | 10 min | Oct 2 | $25, door only |
| Sleepy Hollow Haunted Scream Park | Des Moines (east side) | 10-15 min | Oct 9 (early bird Oct 2-3) | $30-$48 |
| County Line Road Haunted Woods | Carlisle | 15-20 min | Oct 2 | Check the site |

## The haunts

### The Slaughterhouse (downtown Des Moines)

An indoor haunted house of more than 20,000 square feet in downtown Des Moines, with a new area this year called Cannibal Bayou.

- **Where:** 500 Locust St, Des Moines. About 5 minutes from anywhere downtown.
- **2026 dates:** the ticket page lists opening night as Friday, October 2, 2026, at 7 pm, with multiple times available. The site doesn't list the full set of nights or closing times in text, so check the site for 2026 hours.
- **Price:** tickets start at $25 online. The site says tickets are always available at the gate and buying online shortens the wait.
- **Event page:** [The Slaughterhouse Haunted House](/events/the-slaughterhouse-haunted-house-2026-10-01)
- **Site:** [slaughterhousedm.com](https://slaughterhousedm.com/), tickets at [HauntPay](https://app.hauntpay.com/events/theslaughterhouse)

### Linn's Haunted House (Des Moines)

An indoor haunted house in the basement of Linn's Supermarket on Sixth Avenue; the site calls it one of the oldest haunted houses in Iowa and says to expect up to 20 minutes inside.

- **Where:** 3805 6th Ave, Des Moines. About 10 minutes north of downtown.
- **2026 nights and hours:**
  - October 2-3: 7 to 10 pm
  - October 9-10: 7 to 11 pm
  - October 16-17: 7 pm to midnight; October 18: 7 to 10 pm
  - October 22: 7 to 10 pm; October 23-24: 7 pm to midnight; October 25: 7 to 10 pm
  - October 29: 7 to 10 pm; October 30-31: 7 pm to midnight
- **Price:** $25 per person. Tickets are sold at the door only.
- **Site:** [linnshauntedhouse.com](https://www.linnshauntedhouse.com/)

### Sleepy Hollow Haunted Scream Park (Des Moines)

A haunted park on the east side, near the State Fairgrounds, with several haunts on one ticket, including Tormented Souls, The Sawmill and a rope-guided walk in the dark.

- **Where:** 4051 Dean Ave, Des Moines. About 10-15 minutes east of downtown.
- **2026 dates:** October 9-10, 16-17, 23-25 and 29-31. The site also sells early-bird tickets for October 2-3 at $25.
- **Hours:** parking opens at 6:30 pm and gates at 7 pm. On Fridays and Saturdays admission stops at 11 pm and the park closes at midnight. The site doesn't give last admission for Thursday and Sunday nights.
- **Price:** Park Pass $32 adult (12 and up), $30 child (11 and under). VIP Pass $48 adult, $45 child, limited availability. Parking is free.
- **Tickets:** only online tickets guarantee entry. Gate tickets are cash only and limited.
- **Ages:** open to all ages; the park asks parents to decide whether it suits their kids.
- **Site:** [sleepyhollowscreampark.com](https://sleepyhollowscreampark.com/need-to-know)

### County Line Road Haunted Woods (Carlisle)

An outdoor haunted trail in the woods just south of Des Moines off Highway 5. This year's show is The Mare Witch 5.

- **Where:** 1478 Gateway Drive, Carlisle. About 15-20 minutes southeast of downtown.
- **2026 schedule:** opens Friday, October 2. Fridays and Saturdays 7 to 11 pm, Sundays 7 to 9 pm, plus Thursdays October 8, 15 and 22 and Wednesday-Thursday October 28-29 from 7 to 9 pm. Halloween weekend runs October 30-31 (7 to 11 pm) and Sunday, November 1 (7 to 9 pm). Hours are subject to weather.
- **Price:** opening night (October 2) is a charity night with $10 admission for all students. Groups of 20 or more get 25% off. The site doesn't show the regular admission price, so check the site for 2026 prices.
- **Site:** [hauntedwoodsdsm.com](https://www.hauntedwoodsdsm.com/schedule)

## Which one should you pick?

- **Short on time, or no car:** The Slaughterhouse is downtown.
- **Cash at the door, no app:** Linn's.
- **A whole night with friends:** Sleepy Hollow, and buy online, because gate tickets can sell out.
- **Want to be outside:** County Line Road Haunted Woods. Dress for the weather.

## Not as scary

For Halloween plans with younger kids, try [Family Halloween at Living History Farms](/events/family-halloween-2026-10-23), [Trick or Treat Around the Lake](/events/trick-or-treat-around-the-lake-2026-10-22) in Pleasant Hill, or the [Haunted Trolley Tour](/events/the-haunted-trolley-tour-2026-10-02). Daytime fall farms are in our guides to [pumpkin patches and apple orchards](/articles/best-pumpkin-patches-in-the-des-moines-area-your-complete-fall-guide) and [corn mazes near Des Moines](/articles/corn-mazes-near-des-moines).

## Sources

All fetched September 30, 2026.

- The Slaughterhouse: [home](https://slaughterhousedm.com/), [HauntPay ticket page](https://app.hauntpay.com/events/theslaughterhouse)
- Linn's Haunted House: [home](https://www.linnshauntedhouse.com/)
- Sleepy Hollow Haunted Scream Park: [need to know](https://sleepyhollowscreampark.com/need-to-know), [Sleepy Hollow Sports Park event page](https://sleepyhollowsportspark.com/event/haunted-scream-park/2026-10-04/)
- County Line Road Haunted Woods: [home](https://www.hauntedwoodsdsm.com/), [schedule](https://www.hauntedwoodsdsm.com/schedule)
$c$,
  'Four haunted houses open within 20 minutes of downtown Des Moines in October 2026: The Slaughterhouse, Linn''s Haunted House, Sleepy Hollow Haunted Scream Park and County Line Road Haunted Woods. Dates, hours and prices from each one''s own site.',
  array['haunted houses','halloween','october','des moines events','things to do'],
  'Haunted Houses Near Des Moines 2026: Dates, Hours, Prices',
  'Four haunted houses near Des Moines for October 2026 with dates, hours and ticket prices from each haunt''s own site: The Slaughterhouse, Linn''s, Sleepy Hollow and County Line Road Haunted Woods.',
  array['haunted houses des moines','haunted houses near des moines','haunted houses 2026','des moines halloween','slaughterhouse des moines','linns haunted house','sleepy hollow scream park','haunted woods carlisle']
),
(
  'Corn Mazes Near Des Moines (2026)',
  'corn-mazes-near-des-moines',
  $c$**Updated September 30, 2026.** Every date, hour and price here comes from the farm's own website as it read on that day. Drive times from downtown Des Moines are our estimates.

The biggest corn maze near Des Moines is at **Pumpkinville** in Mitchellville, 15-plus acres and about 25 minutes east. **Howell's** in Cumming has an 8-acre maze and is the closest big one, about 20-25 minutes southwest. **Center Grove Orchard** cut a four-acre American farmer design this year. At all five farms below except Pumpkinville, the maze is part of a general admission ticket.

For everything else happening this month, see the [October 2026 events calendar](/events/october-2026).

## Corn mazes at a glance

| Farm | Town | Drive (est.) | Maze | Price |
|---|---|---|---|---|
| Howell's | Cumming | 20-25 min SW | 8 acres | $14 online, $18 gate |
| Pumpkinville and Cornmaze | Mitchellville | 20-25 min E | 15+ acres, plus a mini maze | $1 under 6; check the site for 6+ |
| Wills Family Orchard | Adel | 30 min W | Size not listed | $12 activity pass |
| Center Grove Orchard | Cambridge | 35 min N | 4 acres | $14.95-$23.95 |
| Deal's Orchard | Jefferson | 60-70 min NW | Size not listed | $12.95 online, $14.95 gate |

## The mazes

### Howell's Greenhouse & Pumpkin Patch (Cumming)

An 8-acre corn maze on a fall farm that also has wagon rides, pedal go-karts, goats and a playground on the same ticket.

- **Where:** 3145 Howell Court, Cumming. About 20-25 minutes southwest of downtown.
- **2026 season:** September 12 through November 1. Hours in September and October are 10 am to 6 pm.
- **Price:** $14 per person online (plus fees) or $18 plus tax at the gate, for everyone 2 and older. Seniors 65+ and military (ID required) are $12 plus tax. Fall season pass $45.
- **Maze:** included with admission.
- **Site:** [howellsgreenhouseandpumpkinpatch.com](https://howellsgreenhouseandpumpkinpatch.com/admission/)

### Pumpkinville and Cornmaze (Mitchellville)

A pumpkin farm with a 15-plus-acre corn maze and a mini maze that takes about 15 minutes. There's no general admission; you pay per maze.

- **Where:** 618 Center Ave South, Mitchellville. About 20-25 minutes east of downtown.
- **Season and hours:** corn mazes are open August through October. Closed Mondays; Tuesday through Thursday and Sunday 10 am to 7 pm; Friday and Saturday 10 am to 8 pm. The closing time is the last entry into the mazes, and the farm says to bring a flashlight if you're coming after dark.
- **Price:** the big maze is $1 for ages 3-5 and free for 2 and under; the mini maze is $1 for ages 3 and up. Groups of 15 or more are $7 per person. The site's prices page and corn maze page give two different prices for ages 6 and up ($10 and $8), so check the site before you go.
- **Site:** [pumpkinvillecornmaze.com](https://pumpkinvillecornmaze.com/corn-mazes)

### Wills Family Orchard (Adel)

A weekend apple and pumpkin festival with a corn maze among ten activities on one pass.

- **Where:** 33130 Panther Creek Road, Adel. About 30 minutes west of downtown.
- **2026 festival weekends:** September 12-13, 19-20 and 26-27; October 3-4, 10-11, 17-18 and 24-25. Saturdays 9 am to 6 pm, Sundays noon to 6 pm.
- **Price:** activity pass $12 per person plus tax, which includes the corn maze; children 2 and under are free.
- **Site:** [willsfamilyorchard.com](https://willsfamilyorchard.com/apple-and-pumpkin-fest/)

### Center Grove Orchard (Cambridge)

Four acres of corn cut this year into an American flag and vintage tractor design, part of a farm with a pumpkin patch, hayride and 40-plus attractions.

- **Where:** 32835 610th Avenue, Cambridge. The farm says it's 35 minutes from Des Moines.
- **2026 season:** August 29 through November 8. The 2026 calendar lists 9 am to 7 pm daily, closed Tuesdays, with 9 am to 9 pm on October 2-3, 9-10, 16-17 and 23-24.
- **Price (age 3+):** online $14.95 weekday or $19.95 weekend, plus tax; at the gate $16.95 weekday or $23.95 weekend. Thursdays after 2 pm are buy one, get one free. Fall season pass $69.95.
- **Maze:** included with admission; no separate ticket.
- **Event page:** [Pumpkin Fest at Center Grove Orchard](/events/pumpkin-fest-2026-10-01)
- **Site:** [centergroveorchard.com](https://centergroveorchard.com/pages/corn-maze)

### Deal's Orchard (Jefferson)

A family orchard since 1917 whose Apple Acres play area includes a corn maze, flower fields and hayrides.

- **Where:** 1102 244th Street, Jefferson. About an hour or a little more northwest of downtown.
- **2026 season:** August 29 through November 1, 9 am to 6 pm daily, weather permitting.
- **Price:** Apple Acres is $12.95 online or $14.95 at the gate; 65+ is $6.95 online or $7.95 at the gate; 2 and under free.
- **Site:** [dealsorchard.com](https://dealsorchard.com/)

## Tips for a corn maze

- **Go early on weekends.** Howell's closes at 6 pm, and so does Deal's.
- **After dark:** Pumpkinville lets you in until 7 or 8 pm, and Center Grove stays open until 9 pm on October Fridays and Saturdays through the 24th.
- **Want a scare instead?** See our guide to [haunted houses near Des Moines](/articles/haunted-houses-near-des-moines).

## More October plans

- [Pumpkin patches and apple orchards near Des Moines](/articles/best-pumpkin-patches-in-the-des-moines-area-your-complete-fall-guide)
- [Farmstasia at Living History Farms](/events/farmstasia-2026-2026-10-02)
- [October 2026 events in Des Moines](/events/october-2026)

## Sources

All fetched September 30, 2026.

- Howell's: [admission](https://howellsgreenhouseandpumpkinpatch.com/admission/), [fall activities](https://howellsgreenhouseandpumpkinpatch.com/fall-activities/)
- Pumpkinville and Cornmaze: [home](https://pumpkinvillecornmaze.com/), [prices](https://pumpkinvillecornmaze.com/prices), [corn mazes](https://pumpkinvillecornmaze.com/corn-mazes), [hours](https://pumpkinvillecornmaze.com/hours)
- Wills Family Orchard: [Apple and Pumpkin Fest](https://willsfamilyorchard.com/apple-and-pumpkin-fest/), [FAQs](https://willsfamilyorchard.com/faqs/)
- Center Grove Orchard: [corn maze](https://centergroveorchard.com/pages/corn-maze), [tickets](https://centergroveorchard.com/pages/buy-tickets), [calendar](https://centergroveorchard.com/pages/calendar)
- Deal's Orchard: [home](https://dealsorchard.com/), [Apple Acres 2026 tickets](https://dealsorchard.ticketspice.com/apple-acres-2026)
$c$,
  'The biggest corn maze near Des Moines is Pumpkinville''s 15-plus acres in Mitchellville; Howell''s 8-acre maze in Cumming is the closest big one. Five corn mazes with 2026 dates, hours and prices from each farm''s own site.',
  array['corn mazes','fall activities','family attractions','october','Iowa farms'],
  'Corn Mazes Near Des Moines 2026: Dates, Hours, Prices',
  'Five corn mazes near Des Moines for fall 2026 with dates, hours and prices from each farm''s own site: Pumpkinville, Howell''s, Center Grove, Wills Family Orchard and Deal''s.',
  array['corn maze des moines','corn mazes near des moines','corn maze 2026','corn maze iowa','pumpkinville mitchellville','howells corn maze','center grove corn maze']
)
) as v(title, slug, content, excerpt, tags, seo_title, seo_description, seo_keywords);

-- The sitemap-queue trigger was skipped by replica mode; enqueue by hand.
insert into public.sitemap_change_queue (content_type, content_id, action)
select 'article', id, 'upsert' from public.articles
where slug in ('haunted-houses-near-des-moines', 'corn-mazes-near-des-moines');

set local session_replication_role = origin;

select slug, status, published_at, updated_at, word_count
from public.articles
where slug in ('haunted-houses-near-des-moines', 'corn-mazes-near-des-moines',
               'best-pumpkin-patches-in-the-des-moines-area-your-complete-fall-guide');

commit;
