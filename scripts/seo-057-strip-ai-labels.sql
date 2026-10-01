-- SEO-057: remove model labels and wrapper fields from stored AI event copy.
-- Applied to production 2026-10-01 with psql against SUPABASE_DB_URL, in one
-- transaction. Full rows were saved first to
-- scripts/content-backups/seo-057/events-before.json.
--
-- WHAT THE DATA SAID (counts over every AI-ish text column, 2026-10-01):
--   events.enhanced_description  1951 non-empty; 2 with a model label or a
--                                trailing "**Key:**" field, 3 with ** at all
--   events.original_description  1 with ** (source text from catchdesmoines,
--                                the 9/11 Day row; not model output, left)
--   restaurants.ai_writeup       314 non-empty; 0 labels; 222 open with a
--                                markdown "# Name" heading, 46 with **. That
--                                is formatting, not a label: it stays stored
--                                and AIWriteup now renders it as paragraphs.
--   events.seo_description/geo_summary, restaurants.description/
--   seo_description/geo_summary, attractions.description, playgrounds.
--   description: 0 markdown, 0 labels.
--
-- The two rows are the phantom milb.com/iowa/schedule rows SEO-031 hid
-- (is_hidden = true). Only the label lines go: "**Enhanced Event
-- Description:**" at the top, an empty "**Location:**" or a
-- "**Category:** Sports / **Location:** Principal Park" footer at the end.
-- The prose and its bold heading line are unchanged. Each UPDATE matches the
-- backed-up text exactly, so a row edited since the backup is left alone.

begin;

-- 4e190bd2-7ac7-47fb-b787-39dd667439cf (Iowa Cubs)
update public.events
set enhanced_description = $seo057$**Professional Baseball Action at Principal Park**

Experience the excitement of live baseball as the Iowa Cubs take the field at the iconic Principal Park! This thrilling professional baseball matchup promises an unforgettable evening of America's favorite pastime in one of the Midwest's premier baseball venues.

Located in the heart of Des Moines, Principal Park offers spectacular views and an intimate atmosphere where every seat puts you close to the action. Whether you're a die-hard baseball fan or looking for a perfect family outing, this game delivers entertainment for all ages.

Enjoy classic ballpark concessions, interactive fan experiences, and the electric energy that only live sports can provide. Watch skilled athletes compete at the highest level while soaking in the timeless tradition of baseball under the lights.

Don't miss this opportunity to cheer on the Iowa Cubs and create lasting memories at one of Iowa's most beloved sporting venues!$seo057$
where id = '4e190bd2-7ac7-47fb-b787-39dd667439cf'
  and enhanced_description = $seo057$**Professional Baseball Action at Principal Park**

Experience the excitement of live baseball as the Iowa Cubs take the field at the iconic Principal Park! This thrilling professional baseball matchup promises an unforgettable evening of America's favorite pastime in one of the Midwest's premier baseball venues.

Located in the heart of Des Moines, Principal Park offers spectacular views and an intimate atmosphere where every seat puts you close to the action. Whether you're a die-hard baseball fan or looking for a perfect family outing, this game delivers entertainment for all ages.

Enjoy classic ballpark concessions, interactive fan experiences, and the electric energy that only live sports can provide. Watch skilled athletes compete at the highest level while soaking in the timeless tradition of baseball under the lights.

Don't miss this opportunity to cheer on the Iowa Cubs and create lasting memories at one of Iowa's most beloved sporting venues!

**Category:** Sports  
**Location:** Principal Park$seo057$;

-- 57564c69-0250-4f06-97da-31725edb99d2 (Schedule)
update public.events
set enhanced_description = $seo057$**Iowa Cubs Baseball at Principal Park**

Experience the thrill of America's pastime at beautiful Principal Park! Join us for an exciting professional baseball game featuring the Iowa Cubs, Triple-A affiliate of the Chicago Cubs. 

Located in the heart of Des Moines, Principal Park offers an intimate ballpark atmosphere with excellent sightlines from every seat. Watch tomorrow's MLB stars showcase their skills while enjoying classic ballpark favorites like hot dogs, nachos, and cold beverages.

Whether you're a die-hard baseball fan or looking for family-friendly entertainment, this game promises action-packed innings, potential home run excitement, and the unique charm of minor league baseball. The stadium's modern amenities and affordable pricing make it perfect for date nights, family outings, or corporate events.

Don't miss this opportunity to catch future big leaguers in action at one of the Midwest's premier baseball venues!$seo057$
where id = '57564c69-0250-4f06-97da-31725edb99d2'
  and enhanced_description = $seo057$**Enhanced Event Description:**

**Iowa Cubs Baseball at Principal Park**

Experience the thrill of America's pastime at beautiful Principal Park! Join us for an exciting professional baseball game featuring the Iowa Cubs, Triple-A affiliate of the Chicago Cubs. 

Located in the heart of Des Moines, Principal Park offers an intimate ballpark atmosphere with excellent sightlines from every seat. Watch tomorrow's MLB stars showcase their skills while enjoying classic ballpark favorites like hot dogs, nachos, and cold beverages.

Whether you're a die-hard baseball fan or looking for family-friendly entertainment, this game promises action-packed innings, potential home run excitement, and the unique charm of minor league baseball. The stadium's modern amenities and affordable pricing make it perfect for date nights, family outings, or corporate events.

Don't miss this opportunity to catch future big leaguers in action at one of the Midwest's premier baseball venues!

**Location:**$seo057$;

select id, left(title, 30) as title, left(enhanced_description, 60) as starts,
       right(enhanced_description, 60) as ends
from public.events
where id in ('4e190bd2-7ac7-47fb-b787-39dd667439cf', '57564c69-0250-4f06-97da-31725edb99d2');

commit;
