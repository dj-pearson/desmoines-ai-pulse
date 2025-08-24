-- Create system_settings table for admin controls
CREATE TABLE public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_type TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for system_settings
CREATE POLICY "Only admins can manage system settings" 
ON public.system_settings 
FOR ALL 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Create function for database optimization
CREATE OR REPLACE FUNCTION public.optimize_database_performance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb := '{}';
  vacuum_result text;
BEGIN
  -- Run VACUUM and ANALYZE on key tables
  EXECUTE 'VACUUM ANALYZE public.events';
  EXECUTE 'VACUUM ANALYZE public.restaurants';
  EXECUTE 'VACUUM ANALYZE public.user_ratings';
  EXECUTE 'VACUUM ANALYZE public.content_metrics';
  
  -- Clean up old logs and temporary data
  DELETE FROM public.cron_logs WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM public.security_audit_logs WHERE timestamp < NOW() - INTERVAL '90 days';
  
  -- Update statistics
  EXECUTE 'ANALYZE';
  
  result := jsonb_build_object(
    'status', 'success',
    'message', 'Database optimization completed',
    'operations', jsonb_build_array(
      'VACUUM ANALYZE on core tables',
      'Cleaned old logs',
      'Updated table statistics'
    ),
    'timestamp', now()
  );
  
  RETURN result;
END;
$$;

-- Create function to get database metrics (simulated for demonstration)
CREATE OR REPLACE FUNCTION public.get_database_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  connection_count integer;
BEGIN
  -- Get connection count (simplified)
  SELECT count(*) INTO connection_count FROM pg_stat_activity WHERE state = 'active';
  
  -- Build metrics response
  result := jsonb_build_object(
    'active_connections', connection_count,
    'cpu_usage', floor(random() * 30 + 20)::integer,
    'memory_usage', floor(random() * 20 + 60)::integer,
    'disk_usage', floor(random() * 15 + 35)::integer,
    'timestamp', now()
  );
  
  RETURN result;
END;
$$;