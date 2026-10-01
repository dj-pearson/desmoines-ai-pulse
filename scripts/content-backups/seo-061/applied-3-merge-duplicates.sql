-- SEO-061 step 3: duplicate rows. Backups: restaurants-before.json,
-- playgrounds-before.json. Survivor = the slug with more Search Console
-- impressions in the 2026-09-30 export (Keyword/.../Pages.csv); the loser's
-- URL 301s to it in public/_redirects.
--
-- Restaurants use the repo's merge convention (SEO-060, Toasted Cone):
-- merge_duplicate_content repoints FKs, marks the loser is_merged and logs
-- content_merges, so it is reversible for 30 days.
--   taste-of-new-york-pizza-bar (1,198 impr) <- taste-of-new-york (74).
--     Same Google place id, same 165 S Jordan Creek Pkwy Suite 160 address.
--     tasteofnypizza.com (fetched 2026-10-01) lists the West Des Moines store
--     at "7450 Bridgewood Blvd Unit 215"; the address is NOT changed here.
--   the-pizza-bar (3,198) <- pizza-bar-by-taste-of-new-york (136).
--     Same 1225 Copper Creek Dr, Pleasant Hill. thepizzabaria.com: "The Pizza
--     Bar", "a proud branch of the renowned Taste of New York Pizza".
--   the-iowa-taproom (2) <- iowa-taproom (0). Same Google place id, address
--     and website (SEO-040 found it).
--
-- Playgrounds have no is_merged column and merge_duplicate_content does not
-- take them; no FK references playgrounds (pg_constraint, 2026-10-01). The
-- survivor takes the loser's image or text where its own is empty, then the
-- loser rows are deleted. Restore from playgrounds-before.json.
--   riverview-park (866 impr) <- riverview-park-2 (0). Same 710 Corning Ave.
--     Survivor had no image; takes riverview-park-2's.
--   union-park-playground (66) <- union-park (0), union-park-2 (0). Three rows
--     for Union Park. Survivor had no description, age range or amenities;
--     takes union-park-2's description (union-park's says the slide is
--     "under repair until 2024", a dated claim not carried forward) and
--     union-park's age range and amenities. One user_analytics row points at
--     a loser id; it is analytics history and is left.

begin;

select public.merge_duplicate_content('restaurant',
  (select id from restaurants where slug = 'taste-of-new-york-pizza-bar'),
  (select id from restaurants where slug = 'taste-of-new-york'), 1.0, 'SEO-061');
select public.merge_duplicate_content('restaurant',
  (select id from restaurants where slug = 'the-pizza-bar'),
  (select id from restaurants where slug = 'pizza-bar-by-taste-of-new-york'), 1.0, 'SEO-061');
select public.merge_duplicate_content('restaurant',
  (select id from restaurants where slug = 'the-iowa-taproom'),
  (select id from restaurants where slug = 'iowa-taproom'), 1.0, 'SEO-061');

update public.playgrounds s
   set image_url = coalesce(s.image_url, l.image_url), updated_at = now()
  from public.playgrounds l
 where s.slug = 'riverview-park' and l.slug = 'riverview-park-2';

update public.playgrounds s
   set description = coalesce(nullif(s.description, ''), d.description),
       age_range = coalesce(nullif(s.age_range, ''), a.age_range),
       amenities = coalesce(s.amenities, a.amenities),
       updated_at = now()
  from public.playgrounds d, public.playgrounds a
 where s.slug = 'union-park-playground' and d.slug = 'union-park-2' and a.slug = 'union-park';

delete from public.playgrounds where slug in ('riverview-park-2', 'union-park', 'union-park-2');

commit;
