-- Create advertising campaigns and placements system
CREATE TYPE public.placement_type AS ENUM ('top_banner', 'featured_spot', 'below_fold');
CREATE TYPE public.campaign_status AS ENUM ('draft', 'pending_payment', 'pending_creative', 'active', 'completed', 'cancelled');

-- Campaigns table
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  status campaign_status NOT NULL DEFAULT 'draft',
  start_date DATE,
  end_date DATE,
  total_cost DECIMAL(10,2),
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaign placements
CREATE TABLE public.campaign_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  placement_type placement_type NOT NULL,
  daily_cost DECIMAL(10,2) NOT NULL,
  days_count INTEGER NOT NULL,
  total_cost DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Creative assets
CREATE TABLE public.campaign_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  placement_type placement_type NOT NULL,
  title TEXT,
  description TEXT,
  image_url TEXT,
  link_url TEXT,
  cta_text TEXT DEFAULT 'Learn More',
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_creatives ENABLE ROW LEVEL SECURITY;

-- RLS Policies for campaigns
CREATE POLICY "Users can view their own campaigns" ON public.campaigns
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own campaigns" ON public.campaigns
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own campaigns" ON public.campaigns
FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for placements
CREATE POLICY "Users can view their own placements" ON public.campaign_placements
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE campaigns.id = campaign_placements.campaign_id 
    AND campaigns.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert their own placements" ON public.campaign_placements
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE campaigns.id = campaign_placements.campaign_id 
    AND campaigns.user_id = auth.uid()
  )
);

-- RLS Policies for creatives
CREATE POLICY "Users can manage their own creatives" ON public.campaign_creatives
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE campaigns.id = campaign_creatives.campaign_id 
    AND campaigns.user_id = auth.uid()
  )
);

-- Public read access for active campaigns (for displaying ads)
CREATE POLICY "Public can view active campaign creatives" ON public.campaign_creatives
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE campaigns.id = campaign_creatives.campaign_id 
    AND campaigns.status = 'active'
    AND campaigns.start_date <= CURRENT_DATE 
    AND campaigns.end_date >= CURRENT_DATE
    AND campaign_creatives.is_approved = true
  )
);

-- Function to get active ads by placement type
CREATE OR REPLACE FUNCTION public.get_active_ads(p_placement_type placement_type)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  image_url TEXT,
  link_url TEXT,
  cta_text TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cc.id,
    cc.title,
    cc.description,
    cc.image_url,
    cc.link_url,
    cc.cta_text
  FROM public.campaign_creatives cc
  JOIN public.campaigns c ON c.id = cc.campaign_id
  WHERE cc.placement_type = p_placement_type
    AND c.status = 'active'
    AND c.start_date <= CURRENT_DATE
    AND c.end_date >= CURRENT_DATE
    AND cc.is_approved = true
  ORDER BY RANDOM()
  LIMIT 1;
END;
$$;