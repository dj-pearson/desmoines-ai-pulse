-- SEO-053: retire two 2025 articles that carry invented venue facts.
-- Run against production 2026-10-01.
--
-- Both rows go to status = 'archived' (not deleted). Full rows are backed up in
-- scripts/content-backups/seo-053/articles-<id>.json, so either can be restored
-- with one UPDATE. public/_redirects 301s each URL to the verified SEO-032 guide
-- that replaces it, and both URLs are removed from public/sitemap-articles.xml.
--
-- 1. bd35e640-e5c6-4635-8f4e-06d521281bda
--    halloweekend-in-des-moines-your-ultimate-guide-to-spooky-events-family-fun-2023
--    -> /articles/haunted-houses-near-des-moines
--    Checked 2026-10-01:
--      - "Slaughterhouse ... in nearby Ankeny": false. It's at 500 Locust St,
--        downtown Des Moines (slaughterhousedm.com, Yelp listing).
--      - "Haunted Basement" at Salisbury House: not on salisburyhouse.org/events;
--        the only Halloween event listed there is the Ghoulish Gala ($140, Oct 17).
--      - "Nightmare on Hickman" and "Buried Alive" at Sleepy Hollow: no source
--        names either attraction.
--      - "Vander Veer Botanical Park's Boo at the Zoo": Vander Veer is a Davenport
--        park; the section then describes Blank Park Zoo.
--      - Wilson's Orchard "in nearby Adel": false. Locations are Iowa City and
--        3201 15th Ave, Cumming (wilsonsorchard.com).
--      - Bloomsbury Farm "about 45 minutes from Des Moines": false. It's at 3260
--        69th St, Atkins, 10 minutes west of Cedar Rapids.
--      - "Faulkner's Pumpkin Ranch" in Grimes: no Iowa business found; Faulkner's
--        Ranch is in Kansas City, Missouri.
--    The title also says 2025 while the slug says 2023.
--    GSC: 37 impressions, 0 clicks, position 12.4 over 16 months to 2026-08-28;
--    absent from the 3-month export to 2026-09-30.
--
-- 2. a6670630-996a-4e8e-815e-36425101e939
--    fall-colors-cider-the-ultimate-guide-to-des-moines-apple-orchards-pumpkin-patches-des-moines-guide
--    -> /articles/best-pumpkin-patches-in-the-des-moines-area-your-complete-fall-guide
--    The body is a raw JSON dump (content_score, featured_image_suggestions...)
--    rendered as text, titled 2024. Checked 2026-10-01:
--      - "Center Grove Orchard - Maxwell": the farm is at 32835 610th Ave,
--        Cambridge (centergroveorchard.com, verified under SEO-032).
--      - "Pierce's Pumpkin Patch - Grimes": false. It's at 2491 Hwy 14, Chariton.
--    Merge, not differentiate: every real farm it names (Center Grove, Howell's,
--    Wilson's) is already in the verified pumpkin guide, and the numbers say
--    there is nothing to keep. GSC: 24 impressions, 0 clicks, position 51.0 over
--    16 months; absent from the 3-month export. The pumpkin guide: 2,609
--    impressions, 5 clicks, position 19.0 over 16 months; 618 impressions,
--    2 clicks, position 21.4 in the last 3 months.
--
-- Triggers: trigger_article_webhook only fires on a change TO 'published', so
-- archiving does not post to social. The normal sitemap-queue trigger runs and
-- enqueues both rows. No session_replication_role change is needed.
--
-- OTHER PUBLISHED ARTICLES, spot-checked 2026-10-01 and NOT changed here.
-- Every one of the 15 remaining 2025 articles failed the spot check. Thirteen
-- store the generator's raw JSON (or HTML) as the body; four end in
-- "[Content continues...]" placeholders and one more is truncated. GSC impressions are 16 months to
-- 2026-08-28 / 3 months to 2026-09-30. Unpublishing ranking pages is the
-- owner's call, so these are listed rather than acted on:
--   patio-guide (1741/1043): raw JSON, 9 of 20 spots; Juniper Moon is on
--     Ingersoll, not Court Ave; Star Bar has closed.
--   soups-on (798/449): Django closed Mar 2026; Ritual Cafe closed; Malo,
--     Bubba and Royal Mile in the wrong neighborhoods.
--   cozy-coffee-crawl (558/113): raw HTML; Mars Cafe, Zanzibar's, Scenic
--     Route and Confluence in the wrong towns; Fong's Tea House, Scenic Valley
--     Cafe and Blaze Coffee Roasters not found.
--   highland-park-food-crawl (275/74): raw JSON, 1 of 8 written; Mi Patria
--     is in West Des Moines.
--   drake-food-guide (145/41): raw JSON, 2 of 10; Gazali's moved to Clive.
--   valley-junction-artisan-trail (182/36): most of the 15 makers not found;
--     The Cheese Shop is in Roosevelt.
--   hidden-history (179/23): raw JSON, 3 of 12; "Green Hat Club" not found;
--     Django and Americana closed; Peace Tree closed.
--   budget-explorers (105/5): raw JSON; Neal Smith Trail is ~25 mi, not 63;
--     Botanical Garden is $14; no "Fall Art Festival".
--   beaverdale (81/0): raw JSON; "Beaverdale brick" is a house style, and
--     Beaver Ave is asphalt.
--   date-night (73/0): raw JSON; Horizon Line is West End, not East Village.
--   indoor-farmers-markets-2023-24 (69/0): Winter Market is one November
--     weekend at the Iowa Events Center, not monthly in the skywalk.
--   air-conditioned (10/0): SCI IMAX closed since 2018; Climb Iowa is in
--     Grimes; Pinot's Palette closed.
--   oktoberfest-2023 (0/0): dated 2023; Peace Tree closed 2024; European
--     Flavors is in Windsor Heights.
--   last-call-farmers-market (0/0): D-Line discontinued Nov 2024; 42
--     counties, not 50; quotes from Django chefs.
--   summer-saturday (0/0): Peace Tree and Django closed; Heritage Gallery
--     closed weekends.
--
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/seo-053-retire-fabricated-articles.sql

begin;

update public.articles
set status = 'archived'
where id in ('bd35e640-e5c6-4635-8f4e-06d521281bda',
             'a6670630-996a-4e8e-815e-36425101e939')
  and status = 'published';

select id, slug, status, published_at, updated_at
from public.articles
where id in ('bd35e640-e5c6-4635-8f4e-06d521281bda',
             'a6670630-996a-4e8e-815e-36425101e939');

commit;
