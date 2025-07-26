-- Create events table
CREATE TABLE public.events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  original_description TEXT,
  enhanced_description TEXT,
  date TIMESTAMPTZ NOT NULL,
  location TEXT NOT NULL,
  venue TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  price TEXT,
  image_url TEXT,
  source_url TEXT,
  is_enhanced BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create restaurant_openings table
CREATE TABLE public.restaurant_openings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  cuisine TEXT,
  opening_date DATE,
  status TEXT CHECK (status IN ('opening_soon', 'newly_opened', 'announced')) DEFAULT 'announced',
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create restaurants table
CREATE TABLE public.restaurants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cuisine TEXT,
  location TEXT,
  rating DECIMAL(2,1),
  price_range TEXT,
  description TEXT,
  phone TEXT,
  website TEXT,
  image_url TEXT,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create attractions table
CREATE TABLE public.attractions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  location TEXT,
  description TEXT,
  rating DECIMAL(2,1),
  website TEXT,
  image_url TEXT,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create playgrounds table
CREATE TABLE public.playgrounds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  description TEXT,
  age_range TEXT,
  amenities TEXT[],
  rating DECIMAL(2,1),
  image_url TEXT,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playgrounds ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access (since this is a public-facing app)
CREATE POLICY "Public read access for events" ON public.events FOR SELECT USING (true);
CREATE POLICY "Public read access for restaurant_openings" ON public.restaurant_openings FOR SELECT USING (true);
CREATE POLICY "Public read access for restaurants" ON public.restaurants FOR SELECT USING (true);
CREATE POLICY "Public read access for attractions" ON public.attractions FOR SELECT USING (true);
CREATE POLICY "Public read access for playgrounds" ON public.playgrounds FOR SELECT USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_restaurant_openings_updated_at BEFORE UPDATE ON public.restaurant_openings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_restaurants_updated_at BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attractions_updated_at BEFORE UPDATE ON public.attractions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_playgrounds_updated_at BEFORE UPDATE ON public.playgrounds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_events_date ON public.events(date);
CREATE INDEX idx_events_category ON public.events(category);
CREATE INDEX idx_events_featured ON public.events(is_featured);
CREATE INDEX idx_restaurant_openings_status ON public.restaurant_openings(status);
CREATE INDEX idx_restaurants_featured ON public.restaurants(is_featured);
CREATE INDEX idx_attractions_featured ON public.attractions(is_featured);
CREATE INDEX idx_playgrounds_featured ON public.playgrounds(is_featured);