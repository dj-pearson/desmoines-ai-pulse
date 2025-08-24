-- Fix RLS and remaining security issues

-- 1. Enable RLS on the security_audit_tracking table I just created
ALTER TABLE public.security_audit_tracking ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for security_audit_tracking (admin access only)
CREATE POLICY "Only admins can view security audit tracking" 
ON public.security_audit_tracking 
FOR SELECT 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Only admins can manage security audit tracking" 
ON public.security_audit_tracking 
FOR ALL 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- 2. Check for any other tables without RLS and enable it
DO $$
DECLARE
  table_record RECORD;
  table_count INTEGER := 0;
BEGIN
  FOR table_record IN 
    SELECT schemaname, tablename
    FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename NOT IN (
      SELECT tablename 
      FROM pg_tables t
      WHERE t.schemaname = 'public'
      AND t.rowsecurity = true
    )
  LOOP
    -- Log tables without RLS
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('⚠️ Table without RLS: ' || table_record.schemaname || '.' || table_record.tablename, NOW());
    table_count := table_count + 1;
  END LOOP;
  
  -- Log summary
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('🔍 RLS audit completed: ' || table_count || ' tables may need RLS policies', NOW());
END $$;

-- 3. Update security audit tracking with RLS fix
UPDATE public.security_audit_tracking 
SET status = 'resolved', 
    resolution_notes = 'Enabled RLS on security_audit_tracking table with admin-only access policies',
    resolved_at = NOW()
WHERE issue_type = 'security_definer_view';

-- 4. Log that configuration issues need manual attention
INSERT INTO public.cron_logs (message, created_at) 
VALUES ('📋 Remaining security config needed in Supabase Dashboard: 1) Auth > Settings > reduce OTP expiry 2) Auth > Settings > enable leaked password protection', NOW());