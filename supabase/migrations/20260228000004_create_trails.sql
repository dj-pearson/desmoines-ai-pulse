-- US-047: Trails table for outdoor recreation hub
CREATE TABLE IF NOT EXISTS public.trails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  length_miles NUMERIC,
  difficulty TEXT CHECK (difficulty IN ('easy', 'moderate', 'difficult')),
  surface_type TEXT CHECK (surface_type IN ('paved', 'gravel', 'dirt', 'mixed')),
  activities TEXT[] DEFAULT '{}',
  highlights TEXT,
  trailhead_address TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  image_url TEXT,
  website TEXT,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.trails ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public read access" ON public.trails FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Admin insert" ON public.trails FOR INSERT WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Admin update" ON public.trails FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX idx_trails_slug ON public.trails(slug);
CREATE INDEX idx_trails_difficulty ON public.trails(difficulty);
CREATE INDEX idx_trails_featured ON public.trails(is_featured) WHERE is_featured = true;

-- Seed major Des Moines area trails
INSERT INTO public.trails (name, slug, description, length_miles, difficulty, surface_type, activities, highlights, trailhead_address, latitude, longitude, is_featured) VALUES
('High Trestle Trail', 'high-trestle-trail', 'Iowa''s most iconic trail featuring the stunning 13-story High Trestle Trail Bridge — a half-mile-long engineering and art masterpiece that is one of the most photographed locations in the state.', 25.6, 'easy', 'paved', ARRAY['biking', 'walking', 'running'], 'The High Trestle Trail Bridge, 13 stories above the Des Moines River, with 41 steel frames creating a mine-shaft illusion. Best visited at night when the blue LED lights illuminate the bridge.', 'Woodward, IA 50276', 41.8583, -93.9222, true),
('Raccoon River Valley Trail', 'raccoon-river-valley-trail', 'A 89-mile paved loop trail connecting Des Moines suburbs and small towns — one of the longest paved trails in the United States. Perfect for long-distance cycling adventures.', 89.0, 'easy', 'paved', ARRAY['biking', 'running', 'walking'], 'Passes through charming small towns like Waukee, Dallas Center, Perry, and Jefferson. Great support services along the route with restaurants and bike shops.', 'Waukee, IA 50263', 41.6027, -93.8858, true),
('Gray''s Lake Trail', 'grays-lake-trail', 'A popular 1.9-mile loop trail around Gray''s Lake in the heart of Des Moines. The iconic pedestrian bridge lights up at night and offers stunning views of the downtown skyline.', 1.9, 'easy', 'paved', ARRAY['walking', 'running', 'biking'], 'Iconic lighted pedestrian bridge, downtown skyline views, paddleboard and kayak rentals in summer, and beautiful sunset vistas. Connected to the larger trail network.', '2101 Fleur Dr, Des Moines, IA 50321', 41.5673, -93.6333, true),
('Clive Greenbelt Trail', 'clive-greenbelt-trail', 'A scenic 7.3-mile trail following Walnut Creek through Clive, connecting to the Raccoon River Valley Trail system. Great for family rides and nature walks.', 7.3, 'easy', 'paved', ARRAY['biking', 'walking', 'running'], 'Winds through wooded areas along Walnut Creek with several parks, playgrounds, and picnic areas along the route. Well-maintained and family-friendly.', 'Clive, IA 50325', 41.6014, -93.7453, false),
('Neal Smith Trail', 'neal-smith-trail', 'A 26-mile paved trail connecting Des Moines to the town of Colfax, following the old Chicago Rock Island and Pacific Railroad corridor through scenic Iowa countryside.', 26.0, 'easy', 'paved', ARRAY['biking', 'running'], 'Passes through Big Creek State Park and connects to downtown Des Moines. Great for long-distance rides with rolling Iowa landscapes.', 'Des Moines, IA 50317', 41.6267, -93.5544, false),
('Great Western Trail', 'great-western-trail', 'A 17-mile crushed limestone trail running from Martensdale to Des Moines, offering a quieter alternative with rolling hills and farmland scenery.', 17.0, 'moderate', 'gravel', ARRAY['biking', 'hiking', 'running'], 'Rolling terrain through Warren County farmland, wildflower meadows in spring and summer, fall foliage. Less crowded than paved trails.', 'Martensdale, IA 50160', 41.3836, -93.7419, false),
('Sycamore Trail', 'sycamore-trail', 'A beautiful nature trail winding through Sycamore Park in Pleasant Hill, featuring wooded bluffs, creek crossings, and native prairie restoration areas.', 3.5, 'moderate', 'dirt', ARRAY['hiking', 'walking'], 'Wooded ravines, wildflowers, bird watching, creek crossings, native prairie. A hidden gem for nature lovers close to the city.', 'Pleasant Hill, IA 50327', 41.5836, -93.5169, false),
('Bill Riley Trail', 'bill-riley-trail', 'A 6.2-mile paved trail connecting Water Works Park to Gray''s Lake, following the Raccoon River with views of downtown. Popular for after-work exercise.', 6.2, 'easy', 'paved', ARRAY['biking', 'running', 'walking'], 'River views, connects major Des Moines parks, convenient access from multiple neighborhoods. Beautiful autumn colors along the river.', 'Des Moines, IA 50309', 41.5614, -93.6524, true);
