# Comprehensive Supabase Database Structure Overview

## Project Overview
- **Location**: `/home/user/desmoines-ai-pulse/supabase/`
- **Migrations**: 108 migration files
- **Edge Functions**: 47 functions
- **Framework**: Deno with TypeScript
- **Database**: PostgreSQL with RLS (Row Level Security)

---

## I. DATABASE SCHEMA STRUCTURE

### A. Core Tables

#### 1. **Events Table** (`public.events`)
**Location**: `/home/user/desmoines-ai-pulse/supabase/migrations/20250726143940-2d860109-9c39-4ff9-ab37-1bf98615de2e.sql`

```sql
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
```

**SEO Columns** (Added via migration `20250824160649_51cfdc0c-174b-4f51-91ca-e0b5aac8f3e8.sql`):
- `seo_title TEXT` - Optimized title (under 60 chars)
- `seo_description TEXT` - Meta description (150-155 chars)
- `seo_keywords TEXT[]` - Array of 5 keywords
- `seo_h1 TEXT` - H1 tag matching search intent
- `geo_summary TEXT` - 2-3 sentence geolocation summary
- `geo_key_facts TEXT[]` - Array of 4 key facts
- `geo_faq JSONB` - FAQ structure with question/answer pairs

**Indexes**:
- `idx_events_date` - Query by date
- `idx_events_category` - Filter by category
- `idx_events_featured` - Get featured events

**RLS Policies**:
```sql
-- Public read access for events
CREATE POLICY "Public read access for events" 
ON public.events FOR SELECT USING (true);
```

**Triggers**:
- `update_events_updated_at` - Auto-update timestamp on modifications

---

#### 2. **Restaurants Table** (`public.restaurants`)
**Location**: `/home/user/desmoines-ai-pulse/supabase/migrations/20250726143940-2d860109-9c39-4ff9-ab37-1bf98615de2e.sql`

```sql
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
```

**SEO Columns** (Same as events):
- `seo_title TEXT` - Include restaurant name + cuisine + Des Moines
- `seo_description TEXT` - Meta description for restaurants
- `seo_keywords TEXT[]` - Restaurant-specific keywords
- `seo_h1 TEXT` - Primary search intent heading
- `geo_summary TEXT` - Geolocation-focused summary
- `geo_key_facts TEXT[]` - Restaurant key facts
- `geo_faq JSONB` - Common restaurant questions

**Indexes**:
- `idx_restaurants_featured` - Featured restaurants

---

#### 3. **Attractions Table** (`public.attractions`)
```sql
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
```

---

#### 4. **Playgrounds Table** (`public.playgrounds`)
```sql
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
```

---

#### 5. **Restaurant Openings Table** (`public.restaurant_openings`)
```sql
CREATE TABLE public.restaurant_openings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  cuisine TEXT,
  opening_date DATE,
  status TEXT CHECK (status IN ('opening_soon', 'newly_opened', 'announced')),
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Indexes**:
- `idx_restaurant_openings_status` - Filter by status

---

### B. User & Authentication Tables

#### 1. **User Roles** (`public.user_roles`)
**Location**: `/home/user/desmoines-ai-pulse/supabase/migrations/20250727045308-9f6b8bfc-204d-4af1-94e5-055204fe3358.sql`

**Role Enum Type**:
```sql
CREATE TYPE public.user_role AS ENUM ('user', 'moderator', 'admin', 'root_admin');
```

**Table Structure**:
```sql
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'user',
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
```

**Role Hierarchy**:
- `root_admin` - Full system access (1)
- `admin` - Administrative access (2)
- `moderator` - Content moderation (3)
- `user` - Regular user (4)

**RLS Policies**:
```sql
-- Users can view their own role
CREATE POLICY "Users can view their own role" 
ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Admins can view all roles
CREATE POLICY "Admins can view all roles" 
ON public.user_roles FOR SELECT USING (public.user_has_role_or_higher(auth.uid(), 'admin'));

-- Admins can assign and update roles
CREATE POLICY "Admins can assign roles" 
ON public.user_roles FOR INSERT WITH CHECK (public.user_has_role_or_higher(auth.uid(), 'admin'));

-- Root admins can delete roles
CREATE POLICY "Root admins can delete roles" 
ON public.user_roles FOR DELETE USING (public.user_has_role_or_higher(auth.uid(), 'root_admin'));
```

**Key Functions**:
```sql
-- Get user's highest privilege role
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid UUID)
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ ... $$;

-- Check if user has role or higher privilege
CREATE OR REPLACE FUNCTION public.user_has_role_or_higher(user_uuid UUID, required_role public.user_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ ... $$;
```

---

#### 2. **Profiles Table** (`public.profiles`)
**Location**: `/home/user/desmoines-ai-pulse/supabase/migrations/20250727044133-d33c41b3-6a7e-4835-8254-95a88917fbb1.sql`

```sql
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  communication_preferences JSONB DEFAULT '{"email_notifications": true, "sms_notifications": false, "event_recommendations": true}',
  interests TEXT[] DEFAULT '{}',
  location TEXT,
  user_role public.user_role DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

**RLS Policies** (Enhanced in migration `20250905021821_4b331802-92ab-4ba5-b51f-b88198395804.sql`):
```sql
-- Users can view their own profile
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT USING (auth.uid() = user_id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" 
ON public.profiles FOR SELECT TO authenticated
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Admins can manage all profiles
CREATE POLICY "Admins can update all profiles" 
ON public.profiles FOR UPDATE TO authenticated
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role))
WITH CHECK (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Admins can delete profiles
CREATE POLICY "Admins can delete profiles" 
ON public.profiles FOR DELETE TO authenticated
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));
```

**Security Functions**:
```sql
-- Validate profile user_id and prevent role escalation
CREATE OR REPLACE FUNCTION public.validate_profile_user_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Only allow users to create profiles for themselves (unless admin)
  IF NEW.user_id != auth.uid() AND NOT user_has_role_or_higher(auth.uid(), 'admin'::user_role) THEN
    RAISE EXCEPTION 'Users can only create profiles for themselves';
  END IF;
  
  -- Prevent unauthorized role escalation
  IF NEW.user_role IS NOT NULL AND NEW.user_role != 'user' THEN
    IF NOT user_has_role_or_higher(auth.uid(), 'admin'::user_role) THEN
      RAISE EXCEPTION 'Only administrators can assign non-user roles';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get profile data with privacy controls
CREATE OR REPLACE FUNCTION public.get_user_profile_safe(target_user_id uuid)
RETURNS TABLE (...)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Users can only see their own profile or admins can see any
  IF target_user_id != auth.uid() AND NOT user_has_role_or_higher(auth.uid(), 'admin'::user_role) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to view this profile';
  END IF;
  ...
END;
$$;
```

**Triggers**:
- Auto-update profile timestamp on modification
- Sync role changes from `user_roles` to `profiles`

---

### C. Admin & Security Tables

#### 1. **Admin Action Logs** (`public.admin_action_logs`)
**Location**: `/home/user/desmoines-ai-pole/supabase/migrations/20250806133721_58964b16-7c1e-4f1a-842e-0ad18ff2409e.sql`

```sql
CREATE TABLE IF NOT EXISTS public.admin_action_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_user_id uuid NOT NULL,
    action_type text NOT NULL,  -- 'user_management', 'content_management', 'system_configuration'
    action_description text NOT NULL,
    target_resource text,       -- table or resource affected
    target_id text,             -- id of affected resource
    old_values jsonb,
    new_values jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
```

**RLS Policies**:
```sql
-- Only admins can view admin action logs
CREATE POLICY "Only admins can view admin action logs"
ON public.admin_action_logs FOR SELECT
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Moderators and above can insert logs
CREATE POLICY "Moderators can insert admin action logs"
ON public.admin_action_logs FOR INSERT
WITH CHECK (user_has_role_or_higher(auth.uid(), 'moderator'::user_role));
```

**Indexes**:
- `idx_admin_action_logs_admin_user` - Query by admin
- `idx_admin_action_logs_action_type` - Filter by action type
- `idx_admin_action_logs_created_at` - Time-based queries

---

#### 2. **Failed Authentication Attempts** (`public.failed_auth_attempts`)
**Location**: `/home/user/desmoines-ai-pulse/supabase/migrations/20250806133721_58964b16-7c1e-4f1a-842e-0ad18ff2409e.sql`

```sql
CREATE TABLE IF NOT EXISTS public.failed_auth_attempts (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    email text,
    ip_address text,
    user_agent text,
    attempt_type text NOT NULL DEFAULT 'login',  -- 'login', 'signup', 'password_reset'
    error_message text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
```

**RLS Policies**:
```sql
-- Only admins can view
CREATE POLICY "Only admins can view failed auth attempts"
ON public.failed_auth_attempts FOR SELECT
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- System can insert
CREATE POLICY "System can insert failed auth attempts"
ON public.failed_auth_attempts FOR INSERT WITH CHECK (true);
```

**Indexes**:
- `idx_failed_auth_attempts_email`
- `idx_failed_auth_attempts_ip`
- `idx_failed_auth_attempts_created_at`

**Key Function**:
```sql
CREATE OR REPLACE FUNCTION public.check_auth_rate_limit(p_email text, p_ip_address text)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
    email_attempts integer;
    ip_attempts integer;
    result jsonb;
BEGIN
    -- Count recent attempts by email (last 15 minutes)
    SELECT COUNT(*) INTO email_attempts
    FROM public.failed_auth_attempts
    WHERE email = p_email
      AND created_at > NOW() - INTERVAL '15 minutes';
    
    -- Count recent attempts by IP (last 15 minutes)
    SELECT COUNT(*) INTO ip_attempts
    FROM public.failed_auth_attempts
    WHERE ip_address = p_ip_address
      AND created_at > NOW() - INTERVAL '15 minutes';
    
    -- Block if exceeded limits
    result := jsonb_build_object(
        'email_attempts', email_attempts,
        'ip_attempts', ip_attempts,
        'email_blocked', email_attempts >= 5,
        'ip_blocked', ip_attempts >= 10,
        'blocked', (email_attempts >= 5 OR ip_attempts >= 10)
    );
    
    RETURN result;
END;
$function$;
```

---

#### 3. **Security Audit Logs** (`public.security_audit_logs`)
```sql
CREATE TABLE public.security_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type text NOT NULL,
    resource text,
    action text,
    details jsonb,
    severity text,  -- 'low', 'medium', 'high'
    ip_address text,
    user_id uuid,
    timestamp timestamp with time zone DEFAULT now()
);
```

---

### D. Content Management Tables

#### 1. **Articles Table** (`public.articles`)
**Location**: `/home/user/desmoines-ai-pulse/supabase/migrations/20250825195148_79e0214e-57ce-44ec-b62c-b14606a5c6de.sql`

```sql
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
```

**RLS Policies**:
```sql
-- Anyone can view published articles
CREATE POLICY "Anyone can view published articles" 
ON public.articles FOR SELECT USING (status = 'published');

-- Authors can manage their own articles
CREATE POLICY "Authors can manage their own articles" 
ON public.articles FOR ALL USING (auth.uid() = author_id);

-- Admins can manage all articles
CREATE POLICY "Admins can manage all articles" 
ON public.articles FOR ALL USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));
```

**Auto-slug Generation**:
```sql
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
```

**Indexes**:
- `idx_articles_status`
- `idx_articles_category`
- `idx_articles_published_at`
- `idx_articles_slug`

---

#### 2. **Article Comments Table** (`public.article_comments`)
```sql
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
```

**RLS Policies**:
```sql
-- Anyone can view approved comments
CREATE POLICY "Anyone can view approved comments" 
ON public.article_comments FOR SELECT USING (is_approved = true);

-- Users can create comments
CREATE POLICY "Users can create comments" 
ON public.article_comments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own comments
CREATE POLICY "Users can update their own comments" 
ON public.article_comments FOR UPDATE USING (auth.uid() = user_id);

-- Admins can manage all comments
CREATE POLICY "Admins can manage all comments" 
ON public.article_comments FOR ALL USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));
```

---

#### 3. **Competitors Table** (`public.competitors`)
**Location**: `/home/user/desmoines-ai-pulse/supabase/migrations/20250825021650_44394cc7-9708-4043-a4ae-eacd96777d29.sql`

```sql
CREATE TABLE public.competitors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  website_url TEXT NOT NULL,
  description TEXT,
  primary_focus TEXT,  -- 'tourism', 'events', 'restaurants', etc.
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

**Default Data**:
```sql
INSERT INTO public.competitors (name, website_url, description, primary_focus) 
VALUES ('Catch Des Moines', 'https://www.catchdesmoines.com/', 'Official tourism website for Greater Des Moines, Iowa', 'tourism');
```

**RLS Policies**:
```sql
CREATE POLICY "Admin can manage competitors" 
ON public.competitors FOR ALL 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));
```

---

#### 4. **Competitor Content Table** (`public.competitor_content`)
```sql
CREATE TABLE public.competitor_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_id UUID NOT NULL REFERENCES public.competitors(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,  -- 'event', 'restaurant', 'attraction', 'blog_post'
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  category TEXT,
  tags TEXT[],
  publish_date DATE,
  content_score INTEGER DEFAULT 0,  -- 1-100 content quality score
  engagement_metrics JSONB,         -- social shares, views, etc.
  scraped_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

**Indexes**:
- `idx_competitor_content_competitor_id`
- `idx_competitor_content_type`
- `idx_competitor_content_scraped_at`

---

#### 5. **Content Suggestions Table** (`public.content_suggestions`)
```sql
CREATE TABLE public.content_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_content_id UUID REFERENCES public.competitor_content(id) ON DELETE CASCADE,
  suggestion_type TEXT NOT NULL,  -- 'improve', 'counter', 'gap_fill'
  suggested_title TEXT NOT NULL,
  suggested_description TEXT,
  suggested_tags TEXT[],
  improvement_areas TEXT[],       -- 'seo', 'engagement', 'depth', etc.
  priority_score INTEGER DEFAULT 0,  -- 1-100 priority
  status TEXT DEFAULT 'pending',  -- 'pending', 'in_progress', 'completed', 'rejected'
  ai_analysis JSONB,              -- detailed AI analysis
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

**Indexes**:
- `idx_content_suggestions_priority` - Descending priority
- `idx_content_suggestions_status`

---

#### 6. **Competitor Reports Table** (`public.competitor_reports`)
```sql
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
```

---

#### 7. **AI Configuration Table** (`public.ai_configuration`)
**Location**: `/home/user/desmoines-ai-pulse/supabase/migrations/20251003231412_e781f0bb-eabf-4ded-bf53-cea909bd3f0a.sql`

```sql
CREATE TABLE IF NOT EXISTS public.ai_configuration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
```

**RLS Policies**:
```sql
-- Only admins can manage AI configuration
CREATE POLICY "Admins can manage AI configuration"
ON public.ai_configuration FOR ALL
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));
```

**Default Configuration**:
```sql
INSERT INTO public.ai_configuration (setting_key, setting_value, description) VALUES
('default_model', '"claude-sonnet-4-20250514"', 'Default Claude AI model'),
('api_endpoint', '"https://api.anthropic.com/v1/messages"', 'Anthropic API endpoint'),
('max_tokens_standard', '2000', 'Default max tokens'),
('max_tokens_large', '8000', 'Max tokens for large operations'),
('temperature_precise', '0.1', 'Temperature for extraction'),
('temperature_creative', '0.7', 'Temperature for content generation'),
('anthropic_version', '"2023-06-01"', 'API version header');
```

---

### E. Calendar & Smart Features Tables

#### 1. **User Calendars Table** (`public.user_calendars`)
**Location**: `/home/user/desmoines-ai-pulse/supabase/migrations/20250804022547_3f324847-4072-4761-ba19-de90c67b9ce3.sql`

```sql
CREATE TABLE public.user_calendars (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook', 'apple', 'manual')),
  calendar_id TEXT NOT NULL,
  calendar_name TEXT NOT NULL,
  access_token_encrypted TEXT,     -- For OAuth tokens (encrypted)
  refresh_token_encrypted TEXT,
  is_primary BOOLEAN DEFAULT false,
  sync_enabled BOOLEAN DEFAULT true,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider, calendar_id)
);
```

**RLS Policies**:
```sql
-- Users can view their own calendars
CREATE POLICY "Users can view their own calendars" 
ON public.user_calendars FOR SELECT USING (auth.uid() = user_id);

-- Users can manage their own calendars
CREATE POLICY "Users can manage their own calendars" 
ON public.user_calendars FOR ALL USING (auth.uid() = user_id);
```

---

#### 2. **Calendar Events Table** (`public.calendar_events`)
```sql
CREATE TABLE public.calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_id UUID NOT NULL REFERENCES public.user_calendars(id) ON DELETE CASCADE,
  external_event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  is_all_day BOOLEAN DEFAULT false,
  location TEXT,
  attendees JSONB DEFAULT '[]',
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(calendar_id, external_event_id)
);
```

**Indexes**:
- `idx_calendar_events_user_time` - Multi-column index for user queries with time range

---

#### 3. **Smart Event Suggestions Table** (`public.smart_event_suggestions`)
```sql
CREATE TABLE public.smart_event_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  suggested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reason TEXT NOT NULL,  -- 'free_time', 'similar_interests', 'location_convenient'
  confidence_score DECIMAL(3,2) DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  optimal_time TIMESTAMP WITH TIME ZONE,
  travel_time_minutes INTEGER DEFAULT 0,
  is_dismissed BOOLEAN DEFAULT false,
  is_accepted BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

**Indexes**:
- `idx_smart_suggestions_user_confidence` - Descending confidence for top suggestions

---

#### 4. **Calendar Preferences Table** (`public.calendar_preferences`)
```sql
CREATE TABLE public.calendar_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_hours_start TIME DEFAULT '09:00',
  work_hours_end TIME DEFAULT '17:00',
  work_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5],  -- 0=Sunday, 6=Saturday
  buffer_time_minutes INTEGER DEFAULT 15,
  max_daily_events INTEGER DEFAULT 8,
  auto_suggest_events BOOLEAN DEFAULT true,
  preferred_event_duration INTEGER DEFAULT 120,  -- minutes
  location_radius_km INTEGER DEFAULT 25,
  notification_preferences JSONB DEFAULT '{"email": true, "push": true, "sms": false}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
```

**Smart Suggestion Function**:
```sql
CREATE OR REPLACE FUNCTION public.generate_smart_suggestions(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  user_prefs RECORD;
  event_rec RECORD;
  suggestion_reason TEXT;
  confidence DECIMAL(3,2);
  optimal_time TIMESTAMPTZ;
BEGIN
  -- Get user preferences
  SELECT * INTO user_prefs FROM public.calendar_preferences WHERE user_id = p_user_id;
  
  -- If no preferences, create defaults
  IF user_prefs IS NULL THEN
    INSERT INTO public.calendar_preferences (user_id) VALUES (p_user_id);
    SELECT * INTO user_prefs FROM public.calendar_preferences WHERE user_id = p_user_id;
  END IF;
  
  -- Clear old suggestions (older than 7 days)
  DELETE FROM public.smart_event_suggestions WHERE user_id = p_user_id AND suggested_at < NOW() - INTERVAL '7 days';
  
  -- Generate suggestions for upcoming events
  FOR event_rec IN 
    SELECT e.* FROM public.events e
    WHERE e.date >= NOW() AND e.date <= NOW() + INTERVAL '30 days'
    AND NOT EXISTS (SELECT 1 FROM public.smart_event_suggestions ses 
                    WHERE ses.user_id = p_user_id AND ses.event_id = e.id AND ses.is_dismissed = false)
    LIMIT 20
  LOOP
    -- Calculate suggestion parameters
    suggestion_reason := 'available_time';
    confidence := 0.6;
    
    -- Boost confidence based on interests
    IF event_rec.category IN ('food', 'entertainment', 'culture') THEN
      confidence := confidence + 0.2;
      suggestion_reason := 'similar_interests';
    END IF;
    
    -- Check for calendar conflicts
    IF NOT EXISTS (SELECT 1 FROM public.calendar_events ce
                   WHERE ce.user_id = p_user_id AND ce.status = 'confirmed'
                   AND ce.start_time <= event_rec.date + INTERVAL '2 hours'
                   AND ce.end_time >= event_rec.date - INTERVAL '1 hour') THEN
      confidence := confidence + 0.1;
    END IF;
    
    -- Insert if confidence is high enough
    IF confidence >= 0.5 THEN
      INSERT INTO public.smart_event_suggestions (user_id, event_id, reason, confidence_score, optimal_time)
      VALUES (p_user_id, event_rec.id, suggestion_reason, confidence, event_rec.date);
    END IF;
  END LOOP;
END;
$$;
```

**Calendar Conflict Checking Function**:
```sql
CREATE OR REPLACE FUNCTION public.check_calendar_conflicts(
  p_user_id UUID,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ
) RETURNS TABLE(
  conflict_count INTEGER,
  conflicting_events JSONB
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  SELECT jsonb_agg(jsonb_build_object(...)) INTO conflicts FROM ...;
  RETURN QUERY SELECT COALESCE(jsonb_array_length(conflicts), 0)::INTEGER, COALESCE(conflicts, '[]'::jsonb);
END;
$$;
```

---

### F. AI Models Table

#### **AI Models Table** (`public.ai_models`)
**Location**: `/home/user/desmoines-ai-pulse/supabase/migrations/20251004023003_3518548b-f4c0-4520-840c-d9051ddbf888.sql`

```sql
CREATE TABLE IF NOT EXISTS public.ai_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL UNIQUE,
  model_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  description TEXT,
  context_window INTEGER,
  max_output_tokens INTEGER,
  supports_vision BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
```

**RLS Policies**:
```sql
-- Admins can manage models
CREATE POLICY "Admins can manage AI models"
ON public.ai_models FOR ALL
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Anyone can view active models
CREATE POLICY "Anyone can view active AI models"
ON public.ai_models FOR SELECT
USING (is_active = true);
```

**Indexes**:
- `idx_ai_models_provider`
- `idx_ai_models_active` - Filtered index for active models

**Supported Models**:
- Claude Sonnet 4.5, Sonnet 4, Opus 4.1, Haiku 3.5
- Google Gemini 2.5 (Flash, Pro, Flash Lite)
- OpenAI GPT-5 (GPT-5, GPT-5 Mini, GPT-5 Nano)

---

## II. EDGE FUNCTIONS STRUCTURE

**Location**: `/home/user/desmoines-ai-pulse/supabase/functions/`

### A. Shared Utilities

#### 1. **AI Configuration Module** (`_shared/aiConfig.ts`)
**Location**: `/home/user/desmoines-ai-pulse/supabase/functions/_shared/aiConfig.ts`

**Purpose**: Centralized AI settings configuration

**Key Exports**:
```typescript
interface AIConfig {
  default_model: string;
  api_endpoint: string;
  max_tokens_standard: number;
  max_tokens_large: number;
  temperature_precise: number;
  temperature_creative: number;
  anthropic_version: string;
}

// Fetch AI configuration from database with 5-minute caching
export async function getAIConfig(
  supabaseUrl: string,
  supabaseKey: string
): Promise<AIConfig>

// Get Claude API request headers
export async function getClaudeHeaders(
  claudeApiKey: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<Record<string, string>>

// Build Claude API request body
export async function buildClaudeRequest(
  messages: any[],
  options: {
    supabaseUrl: string;
    supabaseKey: string;
    useCreativeTemp?: boolean;
    useLargeTokens?: boolean;
    customMaxTokens?: number;
    customTemperature?: number;
  }
): Promise<any>
```

**Fallback Configuration** (if database is unreachable):
```typescript
{
  default_model: "claude-sonnet-4-20250514",
  api_endpoint: "https://api.anthropic.com/v1/messages",
  max_tokens_standard: 2000,
  max_tokens_large: 8000,
  temperature_precise: 0.1,
  temperature_creative: 0.7,
  anthropic_version: "2023-06-01"
}
```

**Cache Strategy**: 5-minute TTL with automatic refresh

---

### B. Content Generation Functions

#### 1. **SEO Content Generation** (`generate-seo-content/index.ts`)
**Location**: `/home/user/desmoines-ai-pulse/supabase/functions/generate-seo-content/index.ts`

**Purpose**: Generate SEO-optimized content for events and restaurants

**Request Structure**:
```typescript
{
  contentType: 'event' | 'restaurant',
  batchSize?: number  // Default: 10
}
```

**Processing Logic**:
1. Fetches items with null/empty SEO fields
2. Locks items by setting `seo_title = 'PROCESSING...'`
3. Generates SEO content via Claude API
4. Updates database with generated content
5. Resets lock on failure

**Generated SEO Fields**:
```json
{
  "title": "SEO title (under 60 chars)",
  "description": "Meta description (150-155 chars)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "h1": "H1 tag matching search intent",
  "summary": "2-3 sentence GEO summary",
  "keyFacts": ["Fact 1", "Fact 2", "Fact 3", "Fact 4"],
  "faq": [
    {"question": "Q1?", "answer": "A1"},
    {"question": "Q2?", "answer": "A2"},
    {"question": "Q3?", "answer": "A3"}
  ]
}
```

**Error Handling**:
- Graceful failure with lock reset
- Returns errors array with item IDs

**Response**:
```json
{
  "success": true,
  "processed": 8,
  "total": 10,
  "errors": ["id1: error message"]
}
```

---

#### 2. **Enhance Content** (`enhance-content/index.ts`)
**Request Structure**:
```typescript
{
  contentType: 'event' | 'restaurant',
  contentId: UUID,
  currentData: {...}
}
```

**Processing**:
1. Creates search query from content data
2. Uses Claude to research and enhance
3. Updates database with enhancement
4. Returns updated content

---

### C. API Functions

#### 1. **API Events** (`api-events/index.ts`)
**Location**: `/home/user/desmoines-ai-pulse/supabase/functions/api-events/index.ts`

**Endpoints**:
- `GET /api-events` - List events with filtering
- `GET /api-events/{id}` - Get single event

**Query Parameters**:
```typescript
{
  limit?: number              // Default: 20
  offset?: number             // Default: 0
  category?: string
  location?: string
  city?: string
  search?: string
  start_date?: string        // ISO format
  end_date?: string          // ISO format
  status?: string            // Default: 'live'
}
```

**Response Format**:
```typescript
{
  events: [{
    id: UUID,
    title: string,
    date: string,
    time: string,
    venue: string,
    location: string,
    city: string,
    price: string,
    category: string,
    description: string,
    image_url: string,
    event_url: string,
    coordinates?: { latitude: number, longitude: number },
    is_featured: boolean
  }],
  count: number,
  total: number
}
```

**CORS Headers**:
```typescript
{
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}
```

---

### D. Security & Middleware Functions

#### 1. **Security Middleware** (`security-middleware/index.ts`)
**Location**: `/home/user/desmoines-ai-pulse/supabase/functions/security-middleware/index.ts`

**Features**:
1. **Rate Limiting**:
   - In-memory rate limit store
   - Time-window based (configurable per endpoint)
   - Per-user (ID) or per-IP fallback

2. **Security Configurations**:
   ```typescript
   {
     'auth': { maxRequests: 5, windowMs: 15*60*1000 },      // 5 per 15 min
     'api': { maxRequests: 100, windowMs: 60*60*1000 },     // 100 per hour
     'upload': { maxRequests: 10, windowMs: 60*60*1000 },   // 10 per hour
     'search': { maxRequests: 200, windowMs: 60*60*1000 }   // 200 per hour
   }
   ```

3. **Input Validation**:
   - SQL injection pattern detection
   - String length validation
   - Recursive object validation

4. **Security Headers**:
   ```
   X-Content-Type-Options: nosniff
   X-Frame-Options: DENY
   X-XSS-Protection: 1; mode=block
   Strict-Transport-Security: max-age=31536000; includeSubDomains
   Cache-Control: no-store, no-cache, must-revalidate
   ```

5. **Security Event Logging**:
   - Rate limit violations
   - Auth failures
   - Validation errors
   - Suspicious activity

**Response Headers** (all requests):
```
X-RateLimit-Limit: number
X-RateLimit-Remaining: number
X-RateLimit-Reset: timestamp (seconds)
```

**Rate Limit Exceeded Response**:
```json
{
  "error": "Rate limit exceeded",
  "resetTime": 1234567890
}
```

---

#### 2. **System Backup** (`system-backup/index.ts`)
**Location**: `/home/user/desmoines-ai-pulse/supabase/functions/system-backup/index.ts`

**Request**:
```json
{"action": "full_backup"}
```

**Response**:
```json
{
  "success": true,
  "message": "System backup completed successfully",
  "backupId": "uuid",
  "timestamp": "2025-11-05T...",
  "size": "2.4 GB"
}
```

**Note**: Placeholder implementation - production would include:
- Database dump creation
- File storage backup
- Log archival
- Upload to S3/cloud storage

---

### E. Common Edge Function Patterns

#### 1. **Standard Imports**:
```typescript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
```

#### 2. **CORS Headers Standard**:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  // ... function logic
});
```

#### 3. **Error Handling Pattern**:
```typescript
try {
  // Process request
  return new Response(
    JSON.stringify({ success: true, data: result }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
} catch (error) {
  console.error('Function error:', error);
  return new Response(
    JSON.stringify({ error: error.message }),
    {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}
```

#### 4. **Database Locking Pattern** (for batch processing):
```typescript
// Lock item to prevent duplicate processing
const lockData = {
  processing_field: 'PROCESSING...'
};
const { error: lockError } = await supabase
  .from(tableName)
  .update(lockData)
  .eq('id', itemId)
  .or('field.is.null,field.eq.""');

if (lockError) {
  console.log(`Item already being processed, skipping`);
  continue;
}

// Reset lock on failure
if (error) {
  const resetData = { processing_field: null };
  await supabase.from(tableName).update(resetData).eq('id', itemId);
}
```

---

## III. RLS (ROW LEVEL SECURITY) POLICIES PATTERNS

### A. Public Read Access Pattern
```sql
CREATE POLICY "Public read access for [table]" 
ON public.[table] 
FOR SELECT 
USING (true);
```

### B. User-Owned Data Pattern
```sql
CREATE POLICY "Users can view their own [resource]" 
ON public.[table] 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own [resource]" 
ON public.[table] 
FOR ALL 
USING (auth.uid() = user_id);
```

### C. Role-Based Access Pattern
```sql
CREATE POLICY "Admins can manage [resource]" 
ON public.[table] 
FOR ALL 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Moderators can manage [resource]" 
ON public.[table] 
FOR ALL 
USING (user_has_role_or_higher(auth.uid(), 'moderator'::user_role));
```

### D. Read-Only Access Pattern
```sql
CREATE POLICY "[Role] can view [resource]" 
ON public.[table] 
FOR SELECT 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));
```

### E. Insert-Only with Check Pattern
```sql
CREATE POLICY "Users can create comments" 
ON public.[table] 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);
```

### F. Complex Role Hierarchy Pattern
```sql
CREATE POLICY "Users can view content based on role" 
ON public.[table] 
FOR SELECT 
USING (
  CASE 
    WHEN public.user_has_role_or_higher(auth.uid(), 'admin') THEN true
    WHEN public.user_has_role_or_higher(auth.uid(), 'moderator') THEN is_published = true
    ELSE is_public = true
  END
);
```

---

## IV. COMMON TRIGGER PATTERNS

### A. Auto-Update Timestamp
```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_[table]_updated_at
BEFORE UPDATE ON public.[table]
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
```

### B. Auto-Generated Slug
```sql
CREATE TRIGGER auto_generate_[resource]_slug_trigger
BEFORE INSERT OR UPDATE ON public.[table]
FOR EACH ROW
WHEN (NEW.slug IS NULL OR NEW.slug = '')
EXECUTE FUNCTION public.auto_generate_[resource]_slug();
```

### C. Sync Between Tables
```sql
CREATE TRIGGER sync_[data]_to_[table]
AFTER INSERT OR UPDATE ON public.[source_table]
FOR EACH ROW
EXECUTE FUNCTION public.sync_[data]_to_[table]();
```

### D. Auto-Assign on Creation
```sql
CREATE TRIGGER assign_[property]_on_creation
AFTER INSERT ON public.[table]
FOR EACH ROW
EXECUTE FUNCTION public.handle_[property]_assignment();
```

### E. Audit Logging Trigger
```sql
CREATE TRIGGER log_[resource]_admin_action
AFTER INSERT OR UPDATE OR DELETE ON public.[table]
FOR EACH ROW
EXECUTE FUNCTION public.log_[resource]_admin_action();
```

---

## V. COMMON DATABASE FUNCTIONS

### A. Role Checking Functions
```sql
-- Get user's highest privilege role
get_user_role(user_uuid UUID) RETURNS user_role

-- Check if user has role or higher privilege
user_has_role_or_higher(user_uuid UUID, required_role user_role) RETURNS BOOLEAN
```

### B. Data Validation Functions
```sql
-- Validate user profile data
validate_profile_user_id() RETURNS TRIGGER

-- Check calendar conflicts
check_calendar_conflicts(p_user_id UUID, p_start_time TIMESTAMPTZ, p_end_time TIMESTAMPTZ)
  RETURNS TABLE(conflict_count INTEGER, conflicting_events JSONB)

-- Check authentication rate limits
check_auth_rate_limit(p_email text, p_ip_address text) RETURNS jsonb
```

### C. Content Generation Functions
```sql
-- Generate article slug
generate_article_slug(article_title TEXT) RETURNS TEXT

-- Auto-generate article slug
auto_generate_article_slug() RETURNS TRIGGER

-- Generate smart event suggestions
generate_smart_suggestions(p_user_id UUID) RETURNS void
```

### D. Logging Functions
```sql
-- Log admin actions
log_admin_action(
  p_admin_user_id uuid,
  p_action_type text,
  p_action_description text,
  p_target_resource text DEFAULT NULL,
  p_target_id text DEFAULT NULL,
  p_old_values jsonb DEFAULT NULL,
  p_new_values jsonb DEFAULT NULL
) RETURNS uuid

-- Log security events
log_security_event(event: {...}) RETURNS void
```

### E. Cleanup Functions
```sql
-- Cleanup old security logs
cleanup_old_security_logs() RETURNS void

-- Clear old event suggestions
DELETE FROM smart_event_suggestions WHERE suggested_at < NOW() - INTERVAL '7 days'
```

---

## VI. INDEXES SUMMARY

### Performance Indexes
| Table | Index | Purpose |
|-------|-------|---------|
| events | idx_events_date | Filter/sort by date |
| events | idx_events_category | Filter by category |
| events | idx_events_featured | Get featured events |
| restaurants | idx_restaurants_featured | Featured restaurants |
| articles | idx_articles_status | Filter by status |
| articles | idx_articles_published_at | Sort by publish date |
| articles | idx_articles_slug | Lookup by slug |
| admin_action_logs | idx_admin_action_logs_admin_user | Audit by admin |
| admin_action_logs | idx_admin_action_logs_created_at | Time-based queries |
| user_roles | idx_user_roles_user_id | User lookups |
| user_roles | idx_user_roles_role | Role filtering |
| competitor_content | idx_competitor_content_competitor_id | Competitor queries |
| competitor_content | idx_competitor_content_scraped_at | Latest content |
| content_suggestions | idx_content_suggestions_priority | Top suggestions |
| calendar_events | idx_calendar_events_user_time | User time range |
| ai_models | idx_ai_models_provider | Provider lookup |
| ai_models | idx_ai_models_active | Active models only |

---

## VII. KEY SECURITY FEATURES

### 1. **Role-Based Access Control (RBAC)**
- 4-tier hierarchy: root_admin > admin > moderator > user
- Enforced via `user_has_role_or_higher()` function
- Synced to profiles table for quick lookups

### 2. **Row Level Security (RLS)**
- All tables with sensitive data have RLS enabled
- Policies enforce: public access, user-owned, role-based
- Admin actions logged to `admin_action_logs`

### 3. **Authentication Security**
- Failed attempt tracking in `failed_auth_attempts`
- Rate limiting: 5 attempts per 15 minutes per email
- 10 attempts per 15 minutes per IP address
- Suspicious activity logging with severity levels

### 4. **Audit Logging**
- `admin_action_logs` - All admin actions tracked
- `security_audit_logs` - Security events logged
- `failed_auth_attempts` - Failed login attempts
- Automatic cleanup: 30, 90, 365 days retention

### 5. **API Security**
- CORS headers on all edge functions
- Rate limiting per endpoint type
- Input validation (SQL injection patterns)
- Payload size limits per endpoint
- Security headers (CSP, X-Frame-Options, etc.)

### 6. **Data Protection**
- Encrypted token storage in calendar integrations
- JSONB for complex nested data
- Unique constraints for data integrity
- ON DELETE CASCADE for data cleanup

---

## VIII. BEST PRACTICES IMPLEMENTED

### Database Design
1. ✅ UUIDs for all primary keys
2. ✅ Timestamp tracking (created_at, updated_at)
3. ✅ Appropriate data types (UUID, TEXT, TIMESTAMPTZ, JSONB, etc.)
4. ✅ Constraints and validations
5. ✅ Foreign key relationships with cascade rules
6. ✅ Partial/filtered indexes for performance

### Security
1. ✅ All functions use `SECURITY DEFINER` for sensitive operations
2. ✅ `SET search_path = ''` to prevent function hijacking
3. ✅ RLS policies on all user-facing tables
4. ✅ Input validation before database operations
5. ✅ Audit trails for admin actions
6. ✅ Rate limiting on edge functions

### Code Organization
1. ✅ Shared utilities in `_shared/` directory
2. ✅ Centralized AI configuration
3. ✅ Consistent error handling
4. ✅ Standard CORS headers
5. ✅ Deno-compatible imports
6. ✅ Type safety with TypeScript

### Scalability
1. ✅ Database connection pooling via Supabase
2. ✅ Efficient indexes on frequently queried fields
3. ✅ Pagination support in API endpoints
4. ✅ Caching strategy in AI config (5-minute TTL)
5. ✅ Batch processing with locking to prevent duplicates

---

## IX. FILE REFERENCES SUMMARY

### Critical Migration Files
- **Roles & Profiles**: `20250727045308-9f6b8bfc-204d-4af1-94e5-055204fe3358.sql`
- **User Profiles**: `20250727044133-d33c41b3-6a7e-4835-8254-95a88917fbb1.sql`
- **SEO Fields**: `20250824160649_51cfdc0c-174b-4f51-91ca-e0b5aac8f3e8.sql`
- **Competitor Analysis**: `20250825021650_44394cc7-9708-4043-a4ae-eacd96777d29.sql`
- **Articles**: `20250825195148_79e0214e-57ce-44ec-b62c-b14606a5c6de.sql`
- **Admin Logs**: `20250806133721_58964b16-7c1e-4f1a-842e-0ad18ff2409e.sql`
- **Calendar System**: `20250804022547_3f324847-4072-4761-ba19-de90c67b9ce3.sql`
- **AI Configuration**: `20251003231412_e781f0bb-eabf-4ded-bf53-cea909bd3f0a.sql`
- **AI Models**: `20251004023003_3518548b-f4c0-4520-840c-d9051ddbf888.sql`

### Key Edge Function Files
- **SEO Generation**: `/supabase/functions/generate-seo-content/index.ts`
- **API Events**: `/supabase/functions/api-events/index.ts`
- **Enhance Content**: `/supabase/functions/enhance-content/index.ts`
- **Security Middleware**: `/supabase/functions/security-middleware/index.ts`
- **AI Config**: `/supabase/functions/_shared/aiConfig.ts`

---

## X. NEXT STEPS FOR SEO MANAGEMENT SYSTEM

Based on this structure, the SEO Management System should:

1. **Create Admin Dashboard** with:
   - SEO field management for events, restaurants
   - Bulk SEO generation interface
   - Monitor SEO metrics (keywords, titles, descriptions)
   - View generated content before publishing

2. **Extend SEO Tracking**:
   - Add `seo_effectiveness` table tracking keyword rankings
   - Monitor click-through rates by SEO field
   - A/B test different SEO variations

3. **Integrate with Edge Functions**:
   - Create `/admin-seo-management` edge function
   - Implement batch SEO generation with admin controls
   - Add preview/approval workflow

4. **Database Extensions**:
   - `seo_performance_metrics` - Track SEO effectiveness
   - `seo_audit_log` - Track all SEO changes
   - `seo_templates` - Template management for consistency

5. **Security Considerations**:
   - All admin functions require `admin` role or higher
   - Audit log all SEO changes
   - Implement approval workflows
   - Rate limit batch operations

