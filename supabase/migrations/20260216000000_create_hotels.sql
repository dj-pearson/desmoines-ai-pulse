-- Create hotels table and related junction tables for "Stay in Des Moines" feature
-- Mirrors restaurant pattern with affiliate link support

-- Hotels table
CREATE TABLE IF NOT EXISTS public.hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  short_description TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Des Moines',
  state TEXT NOT NULL DEFAULT 'IA',
  zip TEXT,
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  area TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  affiliate_url TEXT,
  affiliate_provider TEXT,
  image_url TEXT,
  gallery_urls TEXT[],
  star_rating DECIMAL(2,1),
  price_range TEXT,
  avg_nightly_rate INTEGER,
  amenities TEXT[],
  hotel_type TEXT,
  chain_name TEXT,
  total_rooms INTEGER,
  check_in_time TEXT,
  check_out_time TEXT,
  is_featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Junction table: link hotels to events
CREATE TABLE IF NOT EXISTS public.event_hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
  distance_miles DECIMAL(4,1),
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, hotel_id)
);

-- Indexes for hotels
CREATE INDEX IF NOT EXISTS idx_hotels_area ON public.hotels(area);
CREATE INDEX IF NOT EXISTS idx_hotels_active ON public.hotels(is_active);
CREATE INDEX IF NOT EXISTS idx_hotels_featured ON public.hotels(is_featured);
CREATE INDEX IF NOT EXISTS idx_hotels_price ON public.hotels(avg_nightly_rate);
CREATE INDEX IF NOT EXISTS idx_hotels_type ON public.hotels(hotel_type);
CREATE INDEX IF NOT EXISTS idx_hotels_slug ON public.hotels(slug);

-- Indexes for event_hotels
CREATE INDEX IF NOT EXISTS idx_event_hotels_event ON public.event_hotels(event_id);
CREATE INDEX IF NOT EXISTS idx_event_hotels_hotel ON public.event_hotels(hotel_id);

-- Auto-update timestamp trigger for hotels
CREATE TRIGGER hotels_updated_at
  BEFORE UPDATE ON public.hotels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS policies
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_hotels ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read access for hotels" ON public.hotels
  FOR SELECT USING (true);

CREATE POLICY "Public read access for event_hotels" ON public.event_hotels
  FOR SELECT USING (true);

-- Authenticated users can manage (admin will be enforced at app level)
CREATE POLICY "Authenticated users can insert hotels" ON public.hotels
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update hotels" ON public.hotels
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete hotels" ON public.hotels
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert event_hotels" ON public.event_hotels
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update event_hotels" ON public.event_hotels
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete event_hotels" ON public.event_hotels
  FOR DELETE USING (auth.role() = 'authenticated');

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.hotels;

COMMENT ON TABLE public.hotels IS 'Hotel listings for Stay in Des Moines feature with affiliate link support';
COMMENT ON TABLE public.event_hotels IS 'Junction table linking hotels to nearby events';
