-- AOS-MAINT-002: database health agent. Admin-only, read-only inspection RPC
-- that the db-health agent calls (via service role) to surface slow queries,
-- unused / missing indexes, table bloat, and connection pressure. The agent
-- opens tier-2 tasks with concrete suggestions; it never applies anything.
-- Additive only (new function + registry row + schedule).

CREATE OR REPLACE FUNCTION public.db_health_report(
  slow_ms_threshold NUMERIC DEFAULT 200,
  min_seq_scans INTEGER DEFAULT 1000,
  min_rows INTEGER DEFAULT 5000,
  dead_tuple_ratio NUMERIC DEFAULT 0.20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  result JSONB := '{}'::jsonb;
  slow JSONB := '[]'::jsonb;
  unused JSONB := '[]'::jsonb;
  missing JSONB := '[]'::jsonb;
  bloat JSONB := '[]'::jsonb;
  conns JSONB := '{}'::jsonb;
  has_pgss BOOLEAN;
BEGIN
  -- Admin (or the service-role edge function) only.
  IF NOT (auth.role() = 'service_role' OR public.user_has_role_or_higher(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'db_health_report: admin only';
  END IF;

  -- 1) Slow queries — only if pg_stat_statements is installed. Column names
  --    vary by version, so degrade gracefully on any error.
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') INTO has_pgss;
  IF has_pgss THEN
    BEGIN
      EXECUTE format($q$
        SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
          SELECT left(query, 240) AS query,
                 round(mean_exec_time::numeric, 2) AS mean_ms,
                 calls,
                 round(total_exec_time::numeric, 2) AS total_ms
          FROM pg_stat_statements
          WHERE mean_exec_time >= %s
            AND query NOT ILIKE '%%pg_stat_statements%%'
          ORDER BY mean_exec_time DESC
          LIMIT 10
        ) t
      $q$, slow_ms_threshold) INTO slow;
    EXCEPTION WHEN OTHERS THEN
      slow := '[]'::jsonb;
    END;
  END IF;

  -- 2) Unused indexes (idx_scan = 0), excluding PK / unique constraints.
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO unused FROM (
    SELECT s.relname AS table_name,
           s.indexrelname AS index_name,
           pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
           pg_relation_size(s.indexrelid) AS index_bytes
    FROM pg_stat_user_indexes s
    JOIN pg_index i ON i.indexrelid = s.indexrelid
    WHERE s.idx_scan = 0
      AND NOT i.indisprimary
      AND NOT i.indisunique
      AND s.schemaname = 'public'
      AND pg_relation_size(s.indexrelid) > 8192
    ORDER BY pg_relation_size(s.indexrelid) DESC
    LIMIT 15
  ) t;

  -- 3) Missing-index candidates: heavy sequential scanning on sizable tables.
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO missing FROM (
    SELECT relname AS table_name,
           seq_scan,
           idx_scan,
           n_live_tup AS live_rows
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
      AND seq_scan >= min_seq_scans
      AND seq_scan > COALESCE(idx_scan, 0)
      AND n_live_tup >= min_rows
    ORDER BY seq_scan DESC
    LIMIT 15
  ) t;

  -- 4) Table bloat: high dead-tuple ratio on sizable tables.
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO bloat FROM (
    SELECT relname AS table_name,
           n_dead_tup AS dead_rows,
           n_live_tup AS live_rows,
           round((n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0)), 3) AS dead_ratio,
           pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
           last_autovacuum
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
      AND n_dead_tup >= min_rows
      AND (n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0)) >= dead_tuple_ratio
    ORDER BY n_dead_tup DESC
    LIMIT 15
  ) t;

  -- 5) Connection pressure.
  SELECT jsonb_build_object(
    'total', count(*),
    'active', count(*) FILTER (WHERE state = 'active'),
    'idle', count(*) FILTER (WHERE state = 'idle'),
    'idle_in_transaction', count(*) FILTER (WHERE state = 'idle in transaction'),
    'max_connections', current_setting('max_connections')::int
  ) INTO conns
  FROM pg_stat_activity;

  result := jsonb_build_object(
    'generated_at', now(),
    'pg_stat_statements', has_pgss,
    'slow_queries', slow,
    'unused_indexes', unused,
    'missing_index_candidates', missing,
    'bloated_tables', bloat,
    'connections', conns
  );
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.db_health_report(NUMERIC, INTEGER, INTEGER, NUMERIC) FROM public;
GRANT EXECUTE ON FUNCTION public.db_health_report(NUMERIC, INTEGER, INTEGER, NUMERIC) TO authenticated, service_role;

COMMENT ON FUNCTION public.db_health_report(NUMERIC, INTEGER, INTEGER, NUMERIC) IS
  'Read-only DB health inspection (AOS-MAINT-002): slow queries, unused/missing indexes, bloat, connections. Admin/service-role only.';

-- Register the db-health agent, scheduled daily at 07:00 UTC.
INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode)
VALUES
  ('db-health', 'Database Health', 'maintain',
   'Read-only inspection (via admin-only db_health_report RPC) of slow queries, unused/missing indexes, bloat, and connections; opens tier-2 tasks with concrete suggestions and additive CREATE INDEX CONCURRENTLY drafts. Proposes only — never applies (AOS-MAINT-002).',
   '0 7 * * *', true, 0.90, NULL, 'admin', 'live')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('db-health')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'db-health');
    PERFORM cron.schedule(
      'db-health',
      '0 7 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-db-health',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := '{}'::jsonb
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
