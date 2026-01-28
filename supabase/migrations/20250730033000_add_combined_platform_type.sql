-- Add 'combined' platform type to social_media_posts table
-- Guard against missing table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'social_media_posts') THEN
    ALTER TABLE public.social_media_posts 
    DROP CONSTRAINT IF EXISTS social_media_posts_platform_type_check;

    ALTER TABLE public.social_media_posts 
    ADD CONSTRAINT social_media_posts_platform_type_check 
    CHECK (platform_type IN ('twitter_threads', 'facebook_linkedin', 'combined'));
  END IF;
END $$;
