-- Create business partnership portal tables
CREATE TABLE public.business_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL DEFAULT 'restaurant',
  description TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT DEFAULT 'Des Moines',
  state TEXT DEFAULT 'Iowa',
  zip_code TEXT,
  latitude REAL,
  longitude REAL,
  logo_url TEXT,
  cover_image_url TEXT,
  business_hours JSONB DEFAULT '{}',
  amenities TEXT[],
  social_media_links JSONB DEFAULT '{}',
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  is_featured BOOLEAN DEFAULT false,
  partnership_tier TEXT DEFAULT 'basic' CHECK (partnership_tier IN ('basic', 'premium', 'enterprise')),
  monthly_fee NUMERIC DEFAULT 0,
  contract_start_date DATE,
  contract_end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create partnership benefits table
CREATE TABLE public.partnership_benefits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tier TEXT NOT NULL CHECK (tier IN ('basic', 'premium', 'enterprise')),
  benefit_name TEXT NOT NULL,
  benefit_description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create business partnership applications
CREATE TABLE public.partnership_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  website TEXT,
  description TEXT,
  desired_tier TEXT DEFAULT 'basic' CHECK (desired_tier IN ('basic', 'premium', 'enterprise')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'under_review')),
  admin_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create advertising packages table
CREATE TABLE public.advertising_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_name TEXT NOT NULL,
  package_description TEXT,
  price_monthly NUMERIC NOT NULL,
  features JSONB DEFAULT '[]',
  max_ads_per_month INTEGER DEFAULT 10,
  ad_placements TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create business analytics table
CREATE TABLE public.business_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  profile_views INTEGER DEFAULT 0,
  website_clicks INTEGER DEFAULT 0,
  phone_clicks INTEGER DEFAULT 0,
  direction_requests INTEGER DEFAULT 0,
  ad_impressions INTEGER DEFAULT 0,
  ad_clicks INTEGER DEFAULT 0,
  social_media_clicks INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id, date)
);

-- Enable RLS
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partnership_benefits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partnership_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertising_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for business_profiles
CREATE POLICY "Public can view verified business profiles" 
ON public.business_profiles FOR SELECT 
USING (verification_status = 'verified');

CREATE POLICY "Users can create their own business profile" 
ON public.business_profiles FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own business profile" 
ON public.business_profiles FOR UPDATE 
USING (auth.uid() = user_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'business_profiles' AND policyname = 'Admins can manage all business profiles') THEN
    CREATE POLICY "Admins can manage all business profiles" 
    ON public.business_profiles FOR ALL 
    USING (user_has_role_or_higher(auth.uid(), 'admin'));
  END IF;
EXCEPTION WHEN undefined_function THEN
  -- Function doesn't exist, skip policy
END $$;

-- RLS Policies for partnership_benefits
CREATE POLICY "Anyone can view active partnership benefits" 
ON public.partnership_benefits FOR SELECT 
USING (is_active = true);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'partnership_benefits' AND policyname = 'Admins can manage partnership benefits') THEN
    CREATE POLICY "Admins can manage partnership benefits" 
    ON public.partnership_benefits FOR ALL 
    USING (user_has_role_or_higher(auth.uid(), 'admin'));
  END IF;
EXCEPTION WHEN undefined_function THEN
  -- Function doesn't exist, skip policy
END $$;

-- RLS Policies for partnership_applications
CREATE POLICY "Users can create their own applications" 
ON public.partnership_applications FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own applications" 
ON public.partnership_applications FOR SELECT 
USING (auth.uid() = user_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'partnership_applications' AND policyname = 'Admins can manage all applications') THEN
    CREATE POLICY "Admins can manage all applications" 
    ON public.partnership_applications FOR ALL 
    USING (user_has_role_or_higher(auth.uid(), 'admin'));
  END IF;
EXCEPTION WHEN undefined_function THEN
  -- Function doesn't exist, skip policy
END $$;

-- RLS Policies for advertising_packages
CREATE POLICY "Anyone can view active advertising packages" 
ON public.advertising_packages FOR SELECT 
USING (is_active = true);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'advertising_packages' AND policyname = 'Admins can manage advertising packages') THEN
    CREATE POLICY "Admins can manage advertising packages" 
    ON public.advertising_packages FOR ALL 
    USING (user_has_role_or_higher(auth.uid(), 'admin'));
  END IF;
EXCEPTION WHEN undefined_function THEN
  -- Function doesn't exist, skip policy
END $$;

-- RLS Policies for business_analytics
CREATE POLICY "Business owners can view their own analytics" 
ON public.business_analytics FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.business_profiles 
  WHERE id = business_analytics.business_id 
  AND user_id = auth.uid()
));

CREATE POLICY "Service role can manage analytics" 
ON public.business_analytics FOR ALL 
USING (auth.role() = 'service_role'::text);

-- Insert default partnership benefits
INSERT INTO public.partnership_benefits (tier, benefit_name, benefit_description, sort_order) VALUES
('basic', 'Business Profile Listing', 'Basic business profile with contact information', 1),
('basic', 'Customer Reviews', 'Allow customers to leave reviews and ratings', 2),
('basic', 'Basic Analytics', 'View basic analytics for your business profile', 3),

('premium', 'Featured Placement', 'Priority placement in search results', 1),
('premium', 'Enhanced Analytics', 'Detailed analytics with customer insights', 2),
('premium', 'Social Media Integration', 'Link and promote your social media accounts', 3),
('premium', 'Event Promotion', 'Promote your business events on the platform', 4),
('premium', 'Customer Messaging', 'Direct messaging with potential customers', 5),

('enterprise', 'Custom Branding', 'Custom branded pages and promotional materials', 1),
('enterprise', 'API Access', 'Access to our API for custom integrations', 2),
('enterprise', 'Dedicated Account Manager', 'Personal account manager for support', 3),
('enterprise', 'Advanced Advertising', 'Premium advertising placements and campaigns', 4),
('enterprise', 'White-label Options', 'White-label partnership opportunities', 5);

-- Insert default advertising packages
INSERT INTO public.advertising_packages (package_name, package_description, price_monthly, features, max_ads_per_month, ad_placements) VALUES
('Starter', 'Basic advertising package for small businesses', 99.00, 
 '["Banner ads on homepage", "Featured in search results", "Basic analytics"]', 
 5, '{"banner", "search"}'),
 
('Professional', 'Advanced advertising for growing businesses', 299.00, 
 '["Premium banner placements", "Newsletter inclusion", "Social media promotion", "Detailed analytics", "Event promotion"]', 
 15, '{"banner", "search", "newsletter", "social", "events"}'),
 
('Enterprise', 'Comprehensive advertising solution', 599.00, 
 '["All premium placements", "Custom content creation", "Video advertising", "Influencer partnerships", "Dedicated support"]', 
 50, '{"banner", "search", "newsletter", "social", "events", "video", "custom"}');

-- Create triggers for updated_at
CREATE TRIGGER update_business_profiles_updated_at
BEFORE UPDATE ON public.business_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_partnership_applications_updated_at
BEFORE UPDATE ON public.partnership_applications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();