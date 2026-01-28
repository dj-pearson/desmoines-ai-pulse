-- Create articles table for blog/content management
CREATE TABLE public.articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  excerpt TEXT,
  featured_image_url TEXT,
  author_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  category TEXT DEFAULT 'General',
  tags TEXT[] DEFAULT '{}',
  seo_title TEXT,
  seo_description TEXT,
  seo_keywords TEXT[],
  view_count INTEGER DEFAULT 0,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  generated_from_suggestion_id UUID REFERENCES content_suggestions(id)
);

-- Enable RLS
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- Create policies for articles
CREATE POLICY "Anyone can view published articles" 
ON public.articles 
FOR SELECT 
USING (status = 'published');

CREATE POLICY "Authors can manage their own articles" 
ON public.articles 
FOR ALL 
USING (auth.uid() = author_id);

-- Wrap admin policy in DO block with exception handler
DO $$
BEGIN
  CREATE POLICY "Admins can manage all articles" 
  ON public.articles 
  FOR ALL 
  USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));
EXCEPTION
  WHEN undefined_function OR undefined_object THEN
    -- Function or type doesn't exist yet, skip policy creation
    NULL;
END $$;

-- Create article comments table
CREATE TABLE public.article_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  parent_comment_id UUID REFERENCES article_comments(id),
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for comments
ALTER TABLE public.article_comments ENABLE ROW LEVEL SECURITY;

-- Comment policies
CREATE POLICY "Anyone can view approved comments" 
ON public.article_comments 
FOR SELECT 
USING (is_approved = true);

CREATE POLICY "Users can create comments" 
ON public.article_comments 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own comments" 
ON public.article_comments 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Wrap admin policy in DO block with exception handler
DO $$
BEGIN
  CREATE POLICY "Admins can manage all comments" 
  ON public.article_comments 
  FOR ALL 
  USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));
EXCEPTION
  WHEN undefined_function OR undefined_object THEN
    -- Function or type doesn't exist yet, skip policy creation
    NULL;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
CREATE INDEX IF NOT EXISTS idx_article_comments_article_id ON article_comments(article_id);

-- Create trigger for updating timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_articles_updated_at ON public.articles;
CREATE TRIGGER update_articles_updated_at
BEFORE UPDATE ON public.articles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_article_comments_updated_at ON public.article_comments;
CREATE TRIGGER update_article_comments_updated_at
BEFORE UPDATE ON public.article_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-generate slug function
CREATE OR REPLACE FUNCTION public.generate_article_slug(article_title TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(article_title, '[^a-zA-Z0-9\s-]', '', 'g'),
        '\s+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  );
END;
$$ LANGUAGE plpgsql;

-- Auto-generate slug trigger
CREATE OR REPLACE FUNCTION public.auto_generate_article_slug()
RETURNS TRIGGER AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 1;
BEGIN
  -- Generate base slug
  base_slug := public.generate_article_slug(NEW.title);
  final_slug := base_slug;
  
  -- Check for existing slugs and append number if needed
  WHILE EXISTS (SELECT 1 FROM public.articles WHERE slug = final_slug AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  NEW.slug := final_slug;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_generate_article_slug_trigger ON public.articles;
CREATE TRIGGER auto_generate_article_slug_trigger
BEFORE INSERT OR UPDATE ON public.articles
FOR EACH ROW
WHEN (NEW.slug IS NULL OR NEW.slug = '')
EXECUTE FUNCTION public.auto_generate_article_slug();