-- Storage Bucket and Policies for Ad Creatives
-- This migration sets up the storage bucket for ad creative assets

-- ============================================================
-- STORAGE BUCKET
-- ============================================================

-- Create the ad-creatives bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ad-creatives',
  'ad-creatives',
  true, -- Public bucket so approved ads can be displayed
  5242880, -- 5MB limit (500KB for most, but allowing up to 5MB for high-quality images)
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
  ];

-- ============================================================
-- STORAGE POLICIES
-- ============================================================

-- Policy: Allow authenticated users to upload to their own campaign folders
DO $$ BEGIN
  CREATE POLICY "Users can upload to own campaigns"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ad-creatives' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.campaigns WHERE user_id = auth.uid()
    )
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN NULL;
END $$;

-- Policy: Allow users to read their own ad creatives
DO $$ BEGIN
  CREATE POLICY "Users can view own ad creatives"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'ad-creatives' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.campaigns WHERE user_id = auth.uid()
    )
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN NULL;
END $$;

-- Policy: Allow users to update their own ad creatives
DO $$ BEGIN
  CREATE POLICY "Users can update own ad creatives"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'ad-creatives' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.campaigns WHERE user_id = auth.uid()
    )
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN NULL;
END $$;

-- Policy: Allow users to delete their own ad creatives
DO $$ BEGIN
  CREATE POLICY "Users can delete own ad creatives"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'ad-creatives' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.campaigns WHERE user_id = auth.uid()
    )
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN NULL;
END $$;

-- Policy: Allow public to read approved ads
DO $$ BEGIN
  CREATE POLICY "Public can view approved ads"
  ON storage.objects FOR SELECT
  TO public
  USING (
    bucket_id = 'ad-creatives' AND
    (storage.foldername(name))[1] IN (
      SELECT DISTINCT campaign_id::text
      FROM public.campaign_creatives
      WHERE is_approved = true
    )
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN NULL;
END $$;

-- Policy: Allow team members to read ads from campaigns they have access to
DO $$ BEGIN
  CREATE POLICY "Team members can view campaign ads"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'ad-creatives' AND
    (storage.foldername(name))[1] IN (
      SELECT DISTINCT c.id::text
      FROM public.campaigns c
      JOIN public.campaign_team_members ctm ON ctm.campaign_owner_id = c.user_id
      WHERE ctm.team_member_id = auth.uid()
        AND ctm.invitation_status = 'accepted'
    )
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN NULL;
END $$;

-- Policy: Allow admins to manage all ad creatives
DO $$ BEGIN
  CREATE POLICY "Admins can manage all ad creatives"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'ad-creatives' AND
    user_has_role_or_higher(auth.uid(), 'admin'::user_role)
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table OR undefined_function OR undefined_object OR insufficient_privilege THEN NULL;
END $$;

-- ============================================================
-- HELPER FUNCTION FOR FILE VALIDATION
-- ============================================================

-- Function to validate ad creative file uploads
DO $$ BEGIN
  CREATE OR REPLACE FUNCTION public.validate_ad_creative_upload(
    p_campaign_id UUID,
    p_placement_type placement_type,
    p_file_name TEXT,
    p_file_size BIGINT,
    p_file_type TEXT,
    p_width INTEGER,
    p_height INTEGER
  ) RETURNS TABLE (
    is_valid BOOLEAN,
    error_message TEXT
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $func$
  DECLARE
    v_campaign RECORD;
    v_max_file_size BIGINT;
    v_expected_dimensions TEXT[];
  BEGIN
    -- Check if campaign exists and belongs to user
    SELECT * INTO v_campaign
    FROM public.campaigns
    WHERE id = p_campaign_id
      AND (user_id = auth.uid() OR user_has_role_or_higher(auth.uid(), 'admin'::user_role));

    IF v_campaign IS NULL THEN
      RETURN QUERY SELECT false, 'Campaign not found or access denied';
      RETURN;
    END IF;

    -- Check if campaign is in a state that allows creative uploads
    IF v_campaign.status NOT IN ('draft', 'pending_payment', 'pending_creative', 'active') THEN
      RETURN QUERY SELECT false, 'Campaign status does not allow creative uploads';
      RETURN;
    END IF;

    -- Validate file type
    IF p_file_type NOT IN ('image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif') THEN
      RETURN QUERY SELECT false, 'Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed';
      RETURN;
    END IF;

    -- Set max file size based on placement type
    CASE p_placement_type
      WHEN 'top_banner' THEN
        v_max_file_size := 512000; -- 500KB
        v_expected_dimensions := ARRAY['970x90', '320x50'];
      WHEN 'featured_spot' THEN
        v_max_file_size := 307200; -- 300KB
        v_expected_dimensions := ARRAY['300x250', '336x280'];
      WHEN 'below_fold' THEN
        v_max_file_size := 409600; -- 400KB
        v_expected_dimensions := ARRAY['728x90', '320x50'];
    END CASE;

    -- Validate file size
    IF p_file_size > v_max_file_size THEN
      RETURN QUERY SELECT false, format('File size exceeds maximum of %s KB for this placement type', v_max_file_size / 1024);
      RETURN;
    END IF;

    -- Validate dimensions
    IF NOT (format('%sx%s', p_width, p_height) = ANY(v_expected_dimensions)) THEN
      RETURN QUERY SELECT false, format('Invalid dimensions. Expected: %s', array_to_string(v_expected_dimensions, ' or '));
      RETURN;
    END IF;

    -- All validations passed
    RETURN QUERY SELECT true, NULL::TEXT;
  END;
  $func$;
EXCEPTION
  WHEN undefined_table OR undefined_object OR undefined_function THEN NULL;
END $$;

-- ============================================================
-- COMMENTS
-- ============================================================

DO $$ BEGIN
  COMMENT ON FUNCTION public.validate_ad_creative_upload IS 'Validates ad creative file uploads before they are stored';
EXCEPTION
  WHEN undefined_function OR undefined_object THEN NULL;
END $$;
