-- Create competitor analysis tables (fixed for existing schema)
CREATE TABLE public.competitors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  website_url TEXT NOT NULL,
  description TEXT,
  primary_focus TEXT, -- 'tourism', 'events', 'restaurants', etc.
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create competitor content tracking table
CREATE TABLE public.competitor_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_id UUID NOT NULL REFERENCES public.competitors(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL, -- 'event', 'restaurant', 'attraction', 'blog_post'
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  category TEXT,
  tags TEXT[],
  publish_date DATE,
  content_score INTEGER DEFAULT 0, -- 1-100 content quality score
  engagement_metrics JSONB, -- social shares, views, etc.
  scraped_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create content suggestions table
CREATE TABLE public.content_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_content_id UUID REFERENCES public.competitor_content(id) ON DELETE CASCADE,
  suggestion_type TEXT NOT NULL, -- 'improve', 'counter', 'gap_fill'
  suggested_title TEXT NOT NULL,
  suggested_description TEXT,
  suggested_tags TEXT[],
  improvement_areas TEXT[], -- what to improve: 'seo', 'engagement', 'depth', etc.
  priority_score INTEGER DEFAULT 0, -- 1-100 priority for creating this content
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'rejected'
  ai_analysis JSONB, -- detailed AI analysis and reasoning
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create competitor analysis reports table
CREATE TABLE public.competitor_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_id UUID NOT NULL REFERENCES public.competitors(id) ON DELETE CASCADE,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_content_pieces INTEGER DEFAULT 0,
  average_content_score DECIMAL(3,2),
  top_performing_categories TEXT[],
  content_gaps_identified INTEGER DEFAULT 0,
  suggestions_generated INTEGER DEFAULT 0,
  competitive_advantages JSONB,
  recommendations JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_reports ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access using existing role system
CREATE POLICY "Admin can manage competitors" 
ON public.competitors 
FOR ALL 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admin can manage competitor content" 
ON public.competitor_content 
FOR ALL 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admin can manage content suggestions" 
ON public.content_suggestions 
FOR ALL 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admin can view competitor reports" 
ON public.competitor_reports 
FOR SELECT 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Create indexes for better performance
CREATE INDEX idx_competitor_content_competitor_id ON public.competitor_content(competitor_id);
CREATE INDEX idx_competitor_content_type ON public.competitor_content(content_type);
CREATE INDEX idx_competitor_content_scraped_at ON public.competitor_content(scraped_at);
CREATE INDEX idx_content_suggestions_priority ON public.content_suggestions(priority_score DESC);
CREATE INDEX idx_content_suggestions_status ON public.content_suggestions(status);

-- Insert CatchDesMoines as the primary competitor
INSERT INTO public.competitors (name, website_url, description, primary_focus) 
VALUES (
  'Catch Des Moines',
  'https://www.catchdesmoines.com/',
  'Official tourism website for Greater Des Moines, Iowa',
  'tourism'
);

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_competitors_updated_at
  BEFORE UPDATE ON public.competitors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_competitor_content_updated_at
  BEFORE UPDATE ON public.competitor_content
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_content_suggestions_updated_at
  BEFORE UPDATE ON public.content_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();