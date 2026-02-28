-- US-048: Brewery trail checkins table for craft beer trail
CREATE TABLE IF NOT EXISTS public.brewery_trail_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  restaurant_id UUID NOT NULL,
  checked_in_at TIMESTAMPTZ DEFAULT now(),
  photo_url TEXT,
  beer_name TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  UNIQUE(user_id, restaurant_id)
);

-- RLS
ALTER TABLE public.brewery_trail_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own checkins" ON public.brewery_trail_checkins FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Public read checkin counts" ON public.brewery_trail_checkins FOR SELECT USING (true);
CREATE POLICY "Authenticated users can check in" ON public.brewery_trail_checkins FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own checkins" ON public.brewery_trail_checkins FOR UPDATE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_brewery_checkins_user ON public.brewery_trail_checkins(user_id);
CREATE INDEX idx_brewery_checkins_restaurant ON public.brewery_trail_checkins(restaurant_id);
