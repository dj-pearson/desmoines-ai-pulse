-- WEB-SEC-021 ACs 4 and 6: the four tables migration 20260822000003 deliberately
-- left alone, because each needed a design decision rather than a revoke.
--
-- Measured against production 2026-08-22 with the anon key from the client
-- bundle, counts only:
--   feature_flags                   7   every flag, including unreleased work
--   content_metrics            21,778   internal engagement analytics
--   image_optimization_queue    1,370   an internal ops queue
--   media_assets                1,381   uploader user_id, paths, error strings
--
-- WHY THIS TIGHTENING IS SAFE IN ONE RELEASE (CLAUDE.md normally forbids it).
-- Checked per table rather than assumed:
--   * No shipped mobile binary touches any of the four. A case-insensitive grep
--     over ios/ and android/ returns zero references for all of them.
--   * <FeatureFlag> and <Experiment> have ZERO call sites in src/. The hooks
--     exist; nothing renders them. So no anonymous browser surface reads
--     feature_flags today.
--   * Every server reader of feature_flags builds its own SERVICE-ROLE client,
--     which bypasses RLS: agent-control, ai-article-pipeline,
--     assemble-weekly-digest, moderate-content, and _shared/agentGuards via
--     _shared/agentRun.ts:80 and _shared/jobRunner.ts:70.
--     THIS ONE IS LOAD-BEARING. agentGuards.globalKillOn is documented FAIL-OPEN,
--     and it reads with .maybeSingle() -- a row hidden by RLS comes back as
--     {data: null, error: null}, with no error to fail open ON. Had any caller
--     passed an anon client, this migration would have pinned the global agent
--     kill switch to OFF, silently and permanently. Both wrappers construct
--     service-role clients internally, so they are unaffected.
--   * content_metrics, image_optimization_queue and media_assets have no
--     anonymous reader. media_assets is read only by components/admin/
--     MediaLibrary.tsx (admin), by the uploader's own hooks, and by
--     apply-image / cleanup-old-events (service role).
--
-- AC4: feature_flags ---------------------------------------------------------
-- The story asks to "restrict anon SELECT to flags the client must evaluate".
-- target_tiers already carries that distinction and nothing was reading it:
--   ai_trip_planner_v2          {insider,vip}        client-evaluable
--   mobile_app_banner           {free,insider,vip}   client-evaluable
--   search_traffic_dashboard    {admin}              admin surface
--   ai_article_pipeline_enabled {admin}              server automation
--   weekly_digest_enabled       {admin}              server automation
--   content_moderation_enabled  {admin}              server automation
--   aos_kill_switch             {admin}              server automation
-- So four of the seven published the existence and state of internal automation
-- to anyone with the client bundle, including which agents are currently
-- running and whether the kill switch is engaged.
--
-- The gate is the array overlap operator, which is NULL-safe in the right
-- direction: target_tiers IS NULL yields NULL, not true, so a flag added
-- without tiers is hidden rather than published.
DROP POLICY IF EXISTS "Public read access for feature flags" ON public.feature_flags;

CREATE POLICY "Client-evaluable feature flags are readable"
  ON public.feature_flags
  FOR SELECT
  TO public
  USING (target_tiers && ARRAY['free', 'insider', 'vip']::text[]);

CREATE POLICY "Admins can view all feature flags"
  ON public.feature_flags
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['admin'::user_role, 'root_admin'::user_role])
    )
  );

-- AC6: content_metrics -------------------------------------------------------
-- Read by exactly one surface, components/AdminAnalyticsDashboard.tsx.
--
-- The anon key could READ all 21,778 rows and could not WRITE one. Verified,
-- not inferred: an anon POST returns 42501 "new row violates row-level security
-- policy", and every row in the table is metric_type='view' -- there is not a
-- single 'share' or 'click' row, which is what src/hooks/useContentTracking.ts
-- has been trying to insert from the event, restaurant and attraction detail
-- pages since the table was created. It logs the failure at warn level, and
-- console output is stripped from production builds. That hook is repointed at
-- the log-content-metrics edge function in the same commit as this migration.
DROP POLICY IF EXISTS "Anyone can read content metrics" ON public.content_metrics;

CREATE POLICY "Admins can view content metrics"
  ON public.content_metrics
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['admin'::user_role, 'root_admin'::user_role])
    )
  );

-- AC6: image_optimization_queue ----------------------------------------------
-- An internal work queue. Anon read exposed source_url, error_message and the
-- backlog depth. Nothing in src/ reads it; the only client reference is an
-- INSERT at useMediaUpload.ts:336, which cannot succeed either -- the table's
-- only write policy is scoped to service_role. Left as-is here and recorded on
-- the story rather than quietly granted, since enabling that write is a
-- decision about who may queue privileged image work.
DROP POLICY IF EXISTS "Public read access for optimization queue" ON public.image_optimization_queue;

CREATE POLICY "Admins can view the optimization queue"
  ON public.image_optimization_queue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['admin'::user_role, 'root_admin'::user_role])
    )
  );

-- AC6: media_assets ----------------------------------------------------------
-- Not just an image index: the row carries user_id, original_file_name,
-- file_path, processing_error and view/download counts for all 1,381 uploads,
-- so anon read maps who uploaded what. The IMAGES stay public -- they are served
-- from public storage buckets and referenced by image_url on the content tables,
-- which this does not touch. Only the metadata row closes.
--
-- The new read mirrors the write policies that already exist on the table:
-- owners see their own rows, admins see all.
DROP POLICY IF EXISTS "Public read access for media assets" ON public.media_assets;

CREATE POLICY "Users can view their own media"
  ON public.media_assets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all media"
  ON public.media_assets
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
