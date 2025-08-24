-- Create URL sources table for managing crawling targets
CREATE TABLE public.url_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  last_crawled TIMESTAMP WITH TIME ZONE,
  crawl_frequency TEXT DEFAULT 'manual', -- manual, daily, weekly, monthly
  success_rate DECIMAL(5,2) DEFAULT 0.00,
  total_crawls INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.url_sources ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users (admins)
CREATE POLICY "Authenticated users can view URL sources" 
ON public.url_sources 
FOR SELECT 
USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "Authenticated users can manage URL sources" 
ON public.url_sources 
FOR ALL
USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Create function to update timestamps
CREATE TRIGGER update_url_sources_updated_at
BEFORE UPDATE ON public.url_sources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some sample URL sources
INSERT INTO public.url_sources (name, url, category, description) VALUES
('Des Moines Performing Arts', 'https://www.desmoinesperformingarts.org', 'events', 'Main events page for DMPA venues'),
('Greater Des Moines Botanical Garden', 'https://dmbotanicalgarden.com/events', 'events', 'Botanical garden events and classes'),
('Principal Park Events', 'https://www.iowacubs.com/tickets/events', 'events', 'Baseball and stadium events'),
('Catch Des Moines Events', 'https://www.catchdesmoines.com/events', 'events', 'Official DMV tourism events'),
('DMGF Restaurant Guide', 'https://dmgoodfood.com', 'restaurants', 'Des Moines restaurant directory'),
('Juice News Restaurant Openings', 'https://www.juice.state.ia.us', 'restaurant_openings', 'Local restaurant opening news'),
('Des Moines Parks & Recreation', 'https://www.dsm.city/departments/parks-and-recreation', 'playgrounds', 'City parks and playground information'),
('Travel Iowa Attractions', 'https://www.traveliowa.com/destinations/des-moines', 'attractions', 'Iowa tourism attractions in Des Moines area');