-- CMS Features Migration
-- Adds: Author Profiles, Content Queue, Enhanced Categories/Tags

-- =====================================================
-- AUTHOR PROFILES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.author_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  email TEXT,
  website TEXT,
  twitter_handle TEXT,
  linkedin_url TEXT,
  is_active BOOLEAN DEFAULT true,
  article_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-generate slug for author profiles
CREATE OR REPLACE FUNCTION generate_author_slug()
RETURNS TRIGGER AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Generate base slug from display_name
  base_slug := lower(regexp_replace(NEW.display_name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  final_slug := base_slug;

  -- Check for uniqueness and add counter if needed
  WHILE EXISTS (SELECT 1 FROM author_profiles WHERE slug = final_slug AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  NEW.slug := final_slug;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_author_slug
BEFORE INSERT OR UPDATE OF display_name ON author_profiles
FOR EACH ROW
WHEN (NEW.slug IS NULL OR NEW.slug = '' OR (TG_OP = 'UPDATE' AND OLD.display_name != NEW.display_name))
EXECUTE FUNCTION generate_author_slug();

-- Update timestamp trigger
CREATE TRIGGER update_author_profiles_updated_at
BEFORE UPDATE ON author_profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ARTICLE CATEGORIES TABLE (Managed)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.article_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'folder',
  parent_id UUID REFERENCES article_categories(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  article_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-generate slug for categories
CREATE OR REPLACE FUNCTION generate_category_slug()
RETURNS TRIGGER AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  base_slug := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  final_slug := base_slug;

  WHILE EXISTS (SELECT 1 FROM article_categories WHERE slug = final_slug AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  NEW.slug := final_slug;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_category_slug
BEFORE INSERT OR UPDATE OF name ON article_categories
FOR EACH ROW
WHEN (NEW.slug IS NULL OR NEW.slug = '' OR (TG_OP = 'UPDATE' AND OLD.name != NEW.name))
EXECUTE FUNCTION generate_category_slug();

CREATE TRIGGER update_article_categories_updated_at
BEFORE UPDATE ON article_categories
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Seed default categories
INSERT INTO article_categories (name, description, color, icon, sort_order) VALUES
  ('General', 'General news and updates about Des Moines', '#6b7280', 'newspaper', 1),
  ('Events', 'Local events, festivals, and happenings', '#f59e0b', 'calendar', 2),
  ('Restaurants', 'Restaurant reviews and food news', '#ef4444', 'utensils', 3),
  ('Attractions', 'Tourist attractions and points of interest', '#10b981', 'landmark', 4),
  ('Culture', 'Arts, culture, and community', '#8b5cf6', 'palette', 5),
  ('Business', 'Local business news and economy', '#3b82f6', 'briefcase', 6),
  ('Tourism', 'Travel guides and visitor information', '#06b6d4', 'plane', 7),
  ('Entertainment', 'Movies, shows, and nightlife', '#ec4899', 'film', 8),
  ('Food & Drink', 'Food trends, recipes, and drink guides', '#f97316', 'coffee', 9),
  ('Lifestyle', 'Living in Des Moines tips and stories', '#84cc16', 'home', 10)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- ARTICLE TAGS TABLE (Managed)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.article_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  usage_count INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-generate slug for tags
CREATE OR REPLACE FUNCTION generate_tag_slug()
RETURNS TRIGGER AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  base_slug := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  final_slug := base_slug;

  WHILE EXISTS (SELECT 1 FROM article_tags WHERE slug = final_slug AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  NEW.slug := final_slug;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_tag_slug
BEFORE INSERT OR UPDATE OF name ON article_tags
FOR EACH ROW
WHEN (NEW.slug IS NULL OR NEW.slug = '' OR (TG_OP = 'UPDATE' AND OLD.name != NEW.name))
EXECUTE FUNCTION generate_tag_slug();

CREATE TRIGGER update_article_tags_updated_at
BEFORE UPDATE ON article_tags
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ADD COLUMNS TO ARTICLES TABLE FOR CONTENT QUEUE
-- =====================================================
ALTER TABLE articles
ADD COLUMN IF NOT EXISTS author_profile_id UUID REFERENCES author_profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'not_required' CHECK (review_status IN ('not_required', 'pending_review', 'in_review', 'approved', 'rejected', 'changes_requested')),
ADD COLUMN IF NOT EXISTS review_notes TEXT,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES article_categories(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS word_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS reading_time INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0 CHECK (priority >= 0 AND priority <= 10);

-- Create junction table for article-tag relationships
CREATE TABLE IF NOT EXISTS public.article_tag_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES article_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(article_id, tag_id)
);

-- =====================================================
-- CONTENT QUEUE / EDITORIAL WORKFLOW TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.content_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_reviewer UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'approved', 'rejected', 'changes_requested', 'published')),
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  notes TEXT,
  review_deadline TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_queue_status ON content_queue(status);
CREATE INDEX IF NOT EXISTS idx_content_queue_priority ON content_queue(priority DESC);
CREATE INDEX IF NOT EXISTS idx_content_queue_assigned_reviewer ON content_queue(assigned_reviewer);
CREATE INDEX IF NOT EXISTS idx_content_queue_article ON content_queue(article_id);

CREATE TRIGGER update_content_queue_updated_at
BEFORE UPDATE ON content_queue
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- CONTENT QUEUE COMMENTS (for review feedback)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.content_queue_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_item_id UUID NOT NULL REFERENCES content_queue(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  comment TEXT NOT NULL,
  comment_type TEXT DEFAULT 'general' CHECK (comment_type IN ('general', 'approval', 'rejection', 'change_request', 'question')),
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_queue_comments_queue_item ON content_queue_comments(queue_item_id);

CREATE TRIGGER update_content_queue_comments_updated_at
BEFORE UPDATE ON content_queue_comments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- INDEXES FOR NEW COLUMNS
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_articles_author_profile ON articles(author_profile_id);
CREATE INDEX IF NOT EXISTS idx_articles_reviewer ON articles(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_articles_review_status ON articles(review_status);
CREATE INDEX IF NOT EXISTS idx_articles_scheduled_at ON articles(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_articles_category_id ON articles(category_id);
CREATE INDEX IF NOT EXISTS idx_articles_is_featured ON articles(is_featured);
CREATE INDEX IF NOT EXISTS idx_articles_priority ON articles(priority DESC);
CREATE INDEX IF NOT EXISTS idx_author_profiles_user ON author_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_author_profiles_active ON author_profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_article_categories_parent ON article_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_article_categories_active ON article_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_article_tags_featured ON article_tags(is_featured);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Author Profiles RLS
ALTER TABLE author_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active author profiles" ON author_profiles
  FOR SELECT USING (is_active = true);

CREATE POLICY "Authenticated users can view all author profiles" ON author_profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update their own author profile" ON author_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all author profiles" ON author_profiles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Article Categories RLS
ALTER TABLE article_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active categories" ON article_categories
  FOR SELECT USING (is_active = true);

CREATE POLICY "Authenticated users can view all categories" ON article_categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage categories" ON article_categories
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Article Tags RLS
ALTER TABLE article_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tags" ON article_tags
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage tags" ON article_tags
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Article Tag Relations RLS
ALTER TABLE article_tag_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tag relations" ON article_tag_relations
  FOR SELECT USING (true);

CREATE POLICY "Authors can manage their article tags" ON article_tag_relations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM articles
      WHERE articles.id = article_id
      AND articles.author_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all tag relations" ON article_tag_relations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Content Queue RLS
ALTER TABLE content_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authors can view their own queue items" ON content_queue
  FOR SELECT TO authenticated
  USING (submitted_by = auth.uid() OR assigned_reviewer = auth.uid());

CREATE POLICY "Authors can create queue items" ON content_queue
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "Reviewers can update assigned items" ON content_queue
  FOR UPDATE TO authenticated
  USING (assigned_reviewer = auth.uid())
  WITH CHECK (assigned_reviewer = auth.uid());

CREATE POLICY "Admins can manage all queue items" ON content_queue
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Content Queue Comments RLS
ALTER TABLE content_queue_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comments on their queue items" ON content_queue_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM content_queue cq
      WHERE cq.id = queue_item_id
      AND (cq.submitted_by = auth.uid() OR cq.assigned_reviewer = auth.uid())
    )
  );

CREATE POLICY "Users can create comments on accessible queue items" ON content_queue_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM content_queue cq
      WHERE cq.id = queue_item_id
      AND (cq.submitted_by = auth.uid() OR cq.assigned_reviewer = auth.uid())
    )
  );

CREATE POLICY "Admins can manage all comments" ON content_queue_comments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to calculate word count and reading time
CREATE OR REPLACE FUNCTION calculate_article_metrics()
RETURNS TRIGGER AS $$
DECLARE
  plain_text TEXT;
  word_count INTEGER;
BEGIN
  -- Strip HTML tags and get plain text
  plain_text := regexp_replace(NEW.content, '<[^>]*>', '', 'g');
  -- Count words
  word_count := array_length(regexp_split_to_array(plain_text, '\s+'), 1);

  NEW.word_count := COALESCE(word_count, 0);
  NEW.reading_time := GREATEST(1, CEIL(NEW.word_count::NUMERIC / 200)); -- ~200 words per minute

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_article_metrics_trigger
BEFORE INSERT OR UPDATE OF content ON articles
FOR EACH ROW
EXECUTE FUNCTION calculate_article_metrics();

-- Function to update category article count
CREATE OR REPLACE FUNCTION update_category_article_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.category_id != OLD.category_id) THEN
    IF NEW.category_id IS NOT NULL THEN
      UPDATE article_categories
      SET article_count = (
        SELECT COUNT(*) FROM articles WHERE category_id = NEW.category_id AND status = 'published'
      )
      WHERE id = NEW.category_id;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.category_id IS NOT NULL AND OLD.category_id != NEW.category_id THEN
      UPDATE article_categories
      SET article_count = (
        SELECT COUNT(*) FROM articles WHERE category_id = OLD.category_id AND status = 'published'
      )
      WHERE id = OLD.category_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.category_id IS NOT NULL THEN
      UPDATE article_categories
      SET article_count = (
        SELECT COUNT(*) FROM articles WHERE category_id = OLD.category_id AND status = 'published'
      )
      WHERE id = OLD.category_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_category_count_trigger
AFTER INSERT OR UPDATE OF category_id, status OR DELETE ON articles
FOR EACH ROW
EXECUTE FUNCTION update_category_article_count();

-- Function to update author article count
CREATE OR REPLACE FUNCTION update_author_article_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.author_profile_id != OLD.author_profile_id) THEN
    IF NEW.author_profile_id IS NOT NULL THEN
      UPDATE author_profiles
      SET article_count = (
        SELECT COUNT(*) FROM articles WHERE author_profile_id = NEW.author_profile_id AND status = 'published'
      )
      WHERE id = NEW.author_profile_id;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.author_profile_id IS NOT NULL AND OLD.author_profile_id != NEW.author_profile_id THEN
      UPDATE author_profiles
      SET article_count = (
        SELECT COUNT(*) FROM articles WHERE author_profile_id = OLD.author_profile_id AND status = 'published'
      )
      WHERE id = OLD.author_profile_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.author_profile_id IS NOT NULL THEN
      UPDATE author_profiles
      SET article_count = (
        SELECT COUNT(*) FROM articles WHERE author_profile_id = OLD.author_profile_id AND status = 'published'
      )
      WHERE id = OLD.author_profile_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_author_count_trigger
AFTER INSERT OR UPDATE OF author_profile_id, status OR DELETE ON articles
FOR EACH ROW
EXECUTE FUNCTION update_author_article_count();

-- Function to update tag usage count
CREATE OR REPLACE FUNCTION update_tag_usage_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE article_tags SET usage_count = usage_count + 1 WHERE id = NEW.tag_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE article_tags SET usage_count = GREATEST(0, usage_count - 1) WHERE id = OLD.tag_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tag_count_trigger
AFTER INSERT OR DELETE ON article_tag_relations
FOR EACH ROW
EXECUTE FUNCTION update_tag_usage_count();

-- Function to auto-publish scheduled articles
CREATE OR REPLACE FUNCTION publish_scheduled_articles()
RETURNS void AS $$
BEGIN
  UPDATE articles
  SET status = 'published', published_at = now()
  WHERE status = 'scheduled'
  AND scheduled_at <= now();
END;
$$ LANGUAGE plpgsql;
