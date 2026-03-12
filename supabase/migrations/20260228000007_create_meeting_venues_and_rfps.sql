-- US-051: Meeting venues and RFP submissions for group travel portal
CREATE TABLE IF NOT EXISTS public.meeting_venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  venue_type TEXT CHECK (venue_type IN ('conference_center', 'hotel', 'unique_venue', 'outdoor')),
  max_capacity INTEGER,
  min_capacity INTEGER,
  sq_footage INTEGER,
  amenities TEXT[] DEFAULT '{}',
  catering TEXT CHECK (catering IN ('in_house', 'external', 'both')),
  av_equipment BOOLEAN DEFAULT false,
  website TEXT,
  contact_email TEXT,
  image_url TEXT,
  description TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rfp_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  event_dates TEXT,
  expected_attendance INTEGER,
  venue_requirements TEXT,
  budget_range TEXT,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  organization TEXT,
  notes TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'responded', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.meeting_venues ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public read access" ON public.meeting_venues FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Admin insert" ON public.meeting_venues FOR INSERT WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.rfp_submissions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Anyone can submit RFP" ON public.rfp_submissions FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Admin read RFPs" ON public.rfp_submissions FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Admin update RFPs" ON public.rfp_submissions FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX idx_meeting_venues_slug ON public.meeting_venues(slug);
CREATE INDEX idx_meeting_venues_type ON public.meeting_venues(venue_type);
CREATE INDEX idx_meeting_venues_capacity ON public.meeting_venues(max_capacity);
CREATE INDEX idx_rfp_submissions_status ON public.rfp_submissions(status);

-- Seed meeting venues
INSERT INTO public.meeting_venues (name, slug, venue_type, max_capacity, min_capacity, sq_footage, amenities, catering, av_equipment, description) VALUES
('Iowa Events Center', 'iowa-events-center', 'conference_center', 15000, 100, 225000, ARRAY['exhibit_hall', 'breakout_rooms', 'loading_dock', 'wifi', 'parking'], 'in_house', true, 'Iowa''s premier convention facility featuring Hy-Vee Hall (225,000 sq ft) and Wells Fargo Arena (16,980 seats). Connected to downtown hotels via skywalk.'),
('Community Choice Credit Union Convention Center', 'cccucc', 'conference_center', 5000, 50, 51600, ARRAY['ballroom', 'breakout_rooms', 'stage', 'wifi', 'parking', 'catering_kitchen'], 'in_house', true, 'Modern convention center attached to the Hilton Des Moines Downtown. Multiple flexible spaces for conferences, galas, and trade shows.'),
('Des Moines Marriott Downtown', 'marriott-downtown', 'hotel', 1200, 20, 28000, ARRAY['ballroom', 'breakout_rooms', 'pool', 'fitness', 'wifi', 'restaurant'], 'in_house', true, 'Full-service Marriott with 33,000 sq ft of meeting space, connected to skywalk. On-site restaurant and business center.'),
('Hilton Des Moines Downtown', 'hilton-downtown', 'hotel', 800, 10, 21000, ARRAY['ballroom', 'breakout_rooms', 'pool', 'fitness', 'wifi', 'restaurant', 'skywalk'], 'in_house', true, 'Adjacent to the Convention Center with direct skywalk access. 21,000 sq ft of flexible event space.'),
('Brenton Skating Plaza', 'brenton-skating-plaza', 'outdoor', 500, 25, null, ARRAY['outdoor', 'stage', 'parking'], 'external', false, 'Unique outdoor venue in the heart of downtown. Ice skating rink in winter transforms to an open event plaza in warmer months.'),
('The Temple for Performing Arts', 'temple-performing-arts', 'unique_venue', 350, 25, 8000, ARRAY['stage', 'wifi', 'historic'], 'external', true, 'A beautifully restored historic venue with stunning architecture. Perfect for upscale corporate events, galas, and weddings.'),
('Jasper Winery', 'jasper-winery', 'unique_venue', 300, 20, null, ARRAY['outdoor', 'wifi', 'tasting_room', 'parking'], 'both', false, 'Iowa''s largest winery featuring indoor and outdoor event spaces with vineyard views. Popular for corporate retreats and weddings.'),
('Des Moines Art Center', 'art-center', 'unique_venue', 250, 20, null, ARRAY['gallery', 'garden', 'wifi'], 'external', true, 'Host events surrounded by world-class art in a landmark building designed by Eliel Saarinen, I.M. Pei, and Richard Meier.');
