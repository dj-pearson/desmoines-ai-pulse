-- ============================================================
-- MEDIA INFRASTRUCTURE MIGRATION
-- Comprehensive storage, tracking, and optimization tables
-- ============================================================

-- ============================================================
-- 1. MEDIA STORAGE BUCKETS
-- ============================================================

-- Create media bucket for general image uploads (events, profiles, content)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  10485760, -- 10MB limit
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
    'image/svg+xml'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
    'image/svg+xml'
  ];

-- Create video bucket for video uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos',
  'videos',
  true,
  104857600, -- 100MB limit
  ARRAY[
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY[
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime'
  ];

-- Create thumbnails bucket for optimized previews
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'thumbnails',
  'thumbnails',
  true,
  2097152, -- 2MB limit
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/avif'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/avif'
  ];

-- ============================================================
-- 2. MEDIA ASSETS TABLE
-- Central registry for all uploaded media
-- ============================================================

CREATE TABLE IF NOT EXISTS public.media_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- File information
  file_name TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  bucket_id TEXT NOT NULL DEFAULT 'media',
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,

  -- Image/Video dimensions
  width INTEGER,
  height INTEGER,
  duration_seconds NUMERIC, -- For videos

  -- Optimization status
  is_optimized BOOLEAN DEFAULT false,
  optimized_versions JSONB DEFAULT '{}', -- {"webp": "path", "avif": "path", "thumbnail": "path"}
  blur_hash TEXT, -- Placeholder blur hash
  dominant_color TEXT, -- Dominant color for placeholder

  -- Metadata
  alt_text TEXT,
  title TEXT,
  description TEXT,
  tags TEXT[] DEFAULT '{}',

  -- Content associations
  content_type TEXT, -- 'event', 'restaurant', 'attraction', 'article', 'profile', 'general'
  content_id UUID,

  -- Processing status
  processing_status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  processing_error TEXT,

  -- Analytics
  views_count INTEGER DEFAULT 0,
  downloads_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for media_assets
CREATE INDEX IF NOT EXISTS idx_media_assets_user_id ON public.media_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_content ON public.media_assets(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_bucket ON public.media_assets(bucket_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON public.media_assets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_processing ON public.media_assets(processing_status);
CREATE INDEX IF NOT EXISTS idx_media_assets_tags ON public.media_assets USING GIN(tags);

-- Enable RLS
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- RLS policies for media_assets
CREATE POLICY "Public read access for media assets"
ON public.media_assets FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can upload media"
ON public.media_assets FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update their own media"
ON public.media_assets FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own media"
ON public.media_assets FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all media"
ON public.media_assets FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- ============================================================
-- 3. IMAGE OPTIMIZATION QUEUE
-- Track images that need optimization
-- ============================================================

CREATE TABLE IF NOT EXISTS public.image_optimization_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  media_asset_id UUID REFERENCES public.media_assets(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,

  -- Optimization targets
  generate_webp BOOLEAN DEFAULT true,
  generate_avif BOOLEAN DEFAULT true,
  generate_thumbnail BOOLEAN DEFAULT true,
  target_sizes INTEGER[] DEFAULT '{320, 640, 960, 1280, 1920}',

  -- Quality settings
  quality_webp INTEGER DEFAULT 80,
  quality_avif INTEGER DEFAULT 70,
  quality_jpeg INTEGER DEFAULT 85,

  -- Status tracking
  status TEXT DEFAULT 'queued', -- 'queued', 'processing', 'completed', 'failed'
  priority INTEGER DEFAULT 5, -- 1 = highest, 10 = lowest
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,

  -- Results
  result_webp_url TEXT,
  result_avif_url TEXT,
  result_thumbnail_url TEXT,
  result_srcset JSONB, -- {"webp": {"320w": "url", "640w": "url"}, ...}

  -- Timestamps
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  UNIQUE(media_asset_id)
);

-- Index for optimization queue processing
CREATE INDEX IF NOT EXISTS idx_optimization_queue_status ON public.image_optimization_queue(status, priority, queued_at);

-- Enable RLS
ALTER TABLE public.image_optimization_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Public read access for optimization queue"
ON public.image_optimization_queue FOR SELECT
USING (true);

CREATE POLICY "System can manage optimization queue"
ON public.image_optimization_queue FOR ALL
TO service_role
USING (true);

-- ============================================================
-- 4. MEDIA PERFORMANCE METRICS
-- Track image/video performance analytics
-- ============================================================

CREATE TABLE IF NOT EXISTS public.media_performance_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  media_asset_id UUID REFERENCES public.media_assets(id) ON DELETE CASCADE,

  -- Performance data
  page_url TEXT,
  load_time_ms INTEGER,
  format_delivered TEXT, -- 'webp', 'avif', 'jpeg', 'png'
  size_delivered BIGINT,

  -- Client info
  device_type TEXT, -- 'mobile', 'tablet', 'desktop'
  viewport_width INTEGER,
  connection_type TEXT, -- '4g', '3g', 'wifi', etc.
  browser TEXT,

  -- Timestamps
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance metrics
CREATE INDEX IF NOT EXISTS idx_media_perf_asset ON public.media_performance_metrics(media_asset_id);
CREATE INDEX IF NOT EXISTS idx_media_perf_recorded ON public.media_performance_metrics(recorded_at DESC);

-- Enable RLS
ALTER TABLE public.media_performance_metrics ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can view performance metrics"
ON public.media_performance_metrics FOR SELECT
TO authenticated
USING (is_admin());

CREATE POLICY "Anyone can insert performance metrics"
ON public.media_performance_metrics FOR INSERT
WITH CHECK (true);

-- ============================================================
-- 5. STORAGE POLICIES FOR NEW BUCKETS
-- ============================================================

-- Media bucket policies
CREATE POLICY "Public read access for media bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'media');

CREATE POLICY "Authenticated users can upload to media bucket"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'media');

CREATE POLICY "Users can update their own media files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'media' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own media files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'media' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Videos bucket policies
CREATE POLICY "Public read access for videos bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'videos');

CREATE POLICY "Authenticated users can upload to videos bucket"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'videos');

CREATE POLICY "Users can update their own video files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'videos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own video files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'videos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Thumbnails bucket policies (read-only for public, service manages writes)
CREATE POLICY "Public read access for thumbnails bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'thumbnails');

CREATE POLICY "Service can manage thumbnails"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'thumbnails');

-- ============================================================
-- 6. HELPER FUNCTIONS
-- ============================================================

-- Function to get optimized image URL
CREATE OR REPLACE FUNCTION public.get_optimized_image_url(
  p_media_asset_id UUID,
  p_format TEXT DEFAULT 'webp',
  p_width INTEGER DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_asset RECORD;
  v_result TEXT;
BEGIN
  SELECT * INTO v_asset FROM public.media_assets WHERE id = p_media_asset_id;

  IF v_asset IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check for optimized version
  IF v_asset.optimized_versions IS NOT NULL AND
     v_asset.optimized_versions ? p_format THEN
    v_result := v_asset.optimized_versions ->> p_format;
  ELSE
    -- Return original URL
    v_result := format(
      '%s/storage/v1/object/public/%s/%s',
      current_setting('app.supabase_url', true),
      v_asset.bucket_id,
      v_asset.file_path
    );
  END IF;

  RETURN v_result;
END;
$$;

-- Function to increment media view count
CREATE OR REPLACE FUNCTION public.increment_media_views(p_media_asset_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.media_assets
  SET views_count = views_count + 1
  WHERE id = p_media_asset_id;
END;
$$;

-- Function to update media_assets updated_at
CREATE OR REPLACE FUNCTION public.update_media_assets_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_media_assets_updated_at ON public.media_assets;
CREATE TRIGGER trigger_media_assets_updated_at
  BEFORE UPDATE ON public.media_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_media_assets_updated_at();

-- ============================================================
-- 7. ENABLE REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.media_assets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.image_optimization_queue;

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE public.media_assets IS 'Central registry for all uploaded media files';
COMMENT ON TABLE public.image_optimization_queue IS 'Queue for image optimization processing';
COMMENT ON TABLE public.media_performance_metrics IS 'Analytics for media loading performance';
COMMENT ON FUNCTION public.get_optimized_image_url IS 'Returns the best available URL for a media asset';
COMMENT ON FUNCTION public.increment_media_views IS 'Increments the view count for a media asset';
