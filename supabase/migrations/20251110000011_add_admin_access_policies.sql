-- Add admin access policies for analytics and reputation tables
-- Fixes 403 errors for admin users accessing analytics data

-- Helper function to check if user is admin or root_admin
CREATE OR REPLACE FUNCTION is_admin_or_root()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'root_admin')
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Add admin access to user_analytics
DROP POLICY IF EXISTS "Admins can view all analytics" ON public.user_analytics;
CREATE POLICY "Admins can view all analytics" 
  ON public.user_analytics 
  FOR SELECT 
  USING (is_admin_or_root());

-- Add admin access to user_reputation
DROP POLICY IF EXISTS "Admins can view all reputation" ON public.user_reputation;
CREATE POLICY "Admins can view all reputation" 
  ON public.user_reputation 
  FOR SELECT 
  USING (is_admin_or_root());

-- Add admin access to user_interactions_enhanced
DROP POLICY IF EXISTS "Admins can view enhanced analytics" ON public.user_interactions_enhanced;
CREATE POLICY "Admins can view enhanced analytics" 
  ON public.user_interactions_enhanced 
  FOR SELECT 
  USING (is_admin_or_root());

DROP POLICY IF EXISTS "Admins can insert enhanced analytics" ON public.user_interactions_enhanced;
CREATE POLICY "Admins can insert enhanced analytics" 
  ON public.user_interactions_enhanced 
  FOR INSERT 
  WITH CHECK (is_admin_or_root());

-- Add admin access to search_analytics (for search data queries)
DROP POLICY IF EXISTS "Admins can view search analytics" ON public.search_analytics;
CREATE POLICY "Admins can view search analytics" 
  ON public.search_analytics 
  FOR SELECT 
  USING (is_admin_or_root());

-- Add admin access to trending_scores
DROP POLICY IF EXISTS "Admins can view trending scores" ON public.trending_scores;
CREATE POLICY "Admins can view trending scores" 
  ON public.trending_scores 
  FOR SELECT 
  USING (is_admin_or_root());

-- Add admin access to cron_logs
DROP POLICY IF EXISTS "Admins can view cron logs" ON public.cron_logs;
CREATE POLICY "Admins can view cron logs" 
  ON public.cron_logs 
  FOR SELECT 
  USING (is_admin_or_root());

-- Add admin access to user_submitted_events
DROP POLICY IF EXISTS "Admins can view submitted events" ON public.user_submitted_events;
CREATE POLICY "Admins can view submitted events" 
  ON public.user_submitted_events 
  FOR ALL 
  USING (is_admin_or_root());

-- Add admin access to admin_action_logs
DROP POLICY IF EXISTS "Admins can view action logs" ON public.admin_action_logs;
CREATE POLICY "Admins can view action logs" 
  ON public.admin_action_logs 
  FOR ALL 
  USING (is_admin_or_root());

-- Add admin access to content_queue
DROP POLICY IF EXISTS "Admins can manage content queue" ON public.content_queue;
CREATE POLICY "Admins can manage content queue" 
  ON public.content_queue 
  FOR ALL 
  USING (is_admin_or_root());

-- Grant execute permission on the helper function
GRANT EXECUTE ON FUNCTION is_admin_or_root TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION is_admin_or_root IS 
'Returns true if the current user has admin or root_admin role';
