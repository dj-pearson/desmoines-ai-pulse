-- Add 'combined' platform type to social_media_posts table
ALTER TABLE public.social_media_posts 
DROP CONSTRAINT IF EXISTS social_media_posts_platform_type_check;

ALTER TABLE public.social_media_posts 
ADD CONSTRAINT social_media_posts_platform_type_check 
CHECK (platform_type IN ('twitter_threads', 'facebook_linkedin', 'combined'));
