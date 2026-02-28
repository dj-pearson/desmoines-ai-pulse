-- US-052: Seasonal guides table
CREATE TABLE IF NOT EXISTS public.seasonal_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  season TEXT CHECK (season IN ('spring', 'summer', 'fall', 'winter', 'holiday')),
  description TEXT,
  cover_image TEXT,
  content JSONB DEFAULT '{}',
  is_published BOOLEAN DEFAULT false,
  publish_date TIMESTAMPTZ,
  seo_title TEXT,
  seo_description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.seasonal_guides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read published" ON public.seasonal_guides FOR SELECT USING (is_published = true);
CREATE POLICY "Admin full access" ON public.seasonal_guides FOR ALL USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- Indexes
CREATE INDEX idx_seasonal_guides_slug ON public.seasonal_guides(slug);
CREATE INDEX idx_seasonal_guides_season ON public.seasonal_guides(season);
CREATE INDEX idx_seasonal_guides_published ON public.seasonal_guides(is_published) WHERE is_published = true;

-- Seed seasonal guides
INSERT INTO public.seasonal_guides (title, slug, season, description, content, is_published, publish_date, seo_title, seo_description) VALUES
(
  'Summer in Des Moines 2026',
  'summer-2026',
  'summer',
  'Your ultimate guide to summer in Des Moines — outdoor concerts, festivals, farmers markets, pool parties, and the best patios in the city.',
  '{"sections":[{"title":"Outdoor Concerts & Festivals","items":["80/35 Music Festival at Western Gateway Park","Des Moines Arts Festival","Iowa State Fair (August)","Simon Estes Amphitheater summer concert series","Hinterland Music Festival (nearby)"]},{"title":"Best Patios & Rooftops","items":["Mullets rooftop bar downtown","Republic on Grand patio","Exile Brewing Company beer garden","Centro patio dining","Proof rooftop at the Hilton"]},{"title":"Water Activities","items":["Kayaking and paddleboarding at Gray''s Lake","Big Creek State Park beach","Des Moines River water trail","Adventureland water park","Public pool pass ($30 all-summer)"]},{"title":"Farmers Markets","items":["Downtown Farmers'' Market (Saturdays, May-Oct, 20,000+ visitors weekly)","Valley Junction Farmers'' Market (Thursdays)","Beaverdale Farmers'' Market","Ankeny Farmers'' Market"]},{"title":"Insider Tips","items":["Gray''s Lake sunset is the best free activity in the city","The sculpture garden at Pappajohn is best enjoyed at golden hour","Hit the Downtown Farmers'' Market before 9am to avoid crowds","The Des Moines River water trail is an underrated gem"]}]}',
  true,
  '2026-05-01',
  'Summer in Des Moines 2026 — Events, Festivals, Activities Guide',
  'Your complete guide to summer in Des Moines: outdoor concerts, festivals, farmers markets, patios, water activities, and insider tips.'
),
(
  'Fall Festivals & Foliage in Des Moines',
  'fall-festivals',
  'fall',
  'Experience the best of autumn in Des Moines — fall festivals, apple orchards, corn mazes, foliage drives, and cozy coffee shops.',
  '{"sections":[{"title":"Fall Festivals","items":["World Food & Music Festival (September)","Oktoberfest at Adventureland","Pumpkin patches and corn mazes at Center Grove Orchard","Apple picking at Deal''s Orchard","Halloween events at Living History Farms"]},{"title":"Best Foliage Spots","items":["High Trestle Trail — peak colors in mid-October","Ledges State Park (30 min drive, stunning canyon views)","Gray''s Lake loop — beautiful river reflections","Water Works Park along the Raccoon River","Ashworth Park in West Des Moines"]},{"title":"Cozy Season Activities","items":["Coffee crawl: Horizon Line, Scenic Route, Smokey Row","Fall menu tastings at local restaurants","Iowa Wild hockey season starts in October","Gallery walks in the East Village","Des Moines Playhouse fall productions"]},{"title":"Insider Tips","items":["Peak foliage is usually the third week of October","Ledges State Park on a Tuesday morning = zero crowds","Center Grove Orchard weekend waits can be 30+ minutes — go on a weekday","The East Village gallery walk is every First Friday"]}]}',
  true,
  '2026-09-01',
  'Fall in Des Moines — Festivals, Foliage, Apple Orchards Guide',
  'Discover autumn in Des Moines: fall festivals, stunning foliage spots, apple orchards, corn mazes, and cozy season activities.'
),
(
  'Holiday Lights & Markets in Des Moines',
  'holiday-lights',
  'holiday',
  'Make the holidays magical in Des Moines — light displays, holiday markets, ice skating, Santa visits, and festive dining experiences.',
  '{"sections":[{"title":"Holiday Light Displays","items":["Jolly Holiday Lights at Adventureland (drive-through, 2+ million lights)","Holiday Promenade in East Village (mid-November)","Trail of Lights at Ewing Park","Downtown holiday decorations and Cowles Commons tree","Living History Farms Holiday celebrations"]},{"title":"Holiday Markets & Shopping","items":["Christkindlmarket Des Moines (German-style Christmas market)","Holiday Boutique at Community Choice Convention Center","Valley Junction holiday shopping nights","Small Business Saturday in the East Village","Waukee Winter Market"]},{"title":"Ice Skating & Winter Activities","items":["Brenton Skating Plaza downtown (November-March)","Buccaneer Arena public skate sessions","Holiday cookie decorating classes","Des Moines Community Playhouse holiday show","Iowa Wild hockey games"]},{"title":"Insider Tips","items":["Jolly Holiday Lights is best on weekday nights (no wait)","Brenton Skating Plaza is magical during snowfall","Book holiday dining reservations at least 2 weeks ahead","East Village Holiday Promenade includes free hot cocoa"]}]}',
  true,
  '2026-11-15',
  'Holiday Events in Des Moines 2026 — Lights, Markets, Ice Skating',
  'The complete Des Moines holiday guide: light displays, Christmas markets, ice skating, festive dining, and holiday events.'
),
(
  'Iowa State Fair Survival Guide',
  'iowa-state-fair',
  'summer',
  'Everything you need to dominate the Iowa State Fair — must-eat foods, best days to go, parking hacks, and the events not to miss.',
  '{"sections":[{"title":"Must-Eat Foods","items":["Pork Chop on a Stick (Iowa classic since 1963)","Hand-dipped corn dogs at the Midway","Fair-original deep-fried Oreos","Turkey legs from the Turkey Federation tent","State Fair lemonade shake-ups"]},{"title":"Best Days to Go","items":["Opening Thursday: fewest crowds, full fairgrounds access","Monday-Wednesday: shortest food lines, best parking","$3 Thursday: discounted admission and rides","Livestock shows are best on weekday mornings","Grandstand concerts sell out — buy tickets early"]},{"title":"Parking & Getting There","items":["Park at DMACC Ankeny campus and take the free shuttle","Uber/Lyft drop-off at Gate 9 (fastest entry)","$10-15 private lot parking near University Ave","DART offers special fair routes from downtown","Bike racks available at multiple gates"]},{"title":"Insider Tips","items":["Get to the fair by 9am and hit the food vendors before lines form","The Varied Industries Building has air conditioning and free samples","The Butter Cow is in the Agriculture Building — go first thing","Bring a cooler bag for drinks (no outside food, but beverages OK)","Download the Iowa State Fair app for real-time wait times"]}]}',
  true,
  '2026-07-01',
  'Iowa State Fair 2026 Survival Guide — Food, Tips, Parking',
  'The ultimate Iowa State Fair guide: must-eat foods, best days to go, parking hacks, and insider tips for the greatest fair in America.'
);
