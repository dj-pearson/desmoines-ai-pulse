-- Every scheduled job read its credentials with
--     current_setting('app.settings.service_role_key')
-- which is how Supabase used to expose them. It does not any more: the
-- parameter is not defined, and the platform now refuses both
--     ALTER DATABASE postgres SET app.settings.service_role_key = ...
--     ALTER ROLE     postgres SET app.settings.service_role_key = ...
-- with "permission denied to set parameter". So there was no value to put
-- there and no way to put one there.
--
-- The visible symptom was 48 of 62 jobs failing 100% of the time on
-- 'unrecognized configuration parameter "app.settings.supabase_url"',
-- every run since they were created. Nothing scheduled has ever executed:
-- not event scraping, not event enhancement, not image backfill, not sitemap
-- regeneration, not event reminders. The failures never reached the network,
-- which is why they cost no egress and left no edge function logs to notice.
--
-- Supabase Vault is the supported replacement. The secrets live in
-- vault.secrets encrypted at rest; app_secret() reads one back. Job commands
-- below are rewritten in place to call it.

create or replace function public.app_secret(p_name text)
returns text
language sql
security definer
stable
set search_path = vault, public, pg_temp
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;

comment on function public.app_secret(text) is
  'Reads a Vault secret. Replaces the removed app.settings.* GUCs for pg_cron jobs.';

-- Callable only by the job owner and the service role; never by API clients.
revoke all on function public.app_secret(text) from public, anon, authenticated;

-- Rewrite every job command off the dead GUC and onto the Vault reader.
-- Handles both call shapes present: current_setting('app.settings.x') and
-- current_setting('app.settings.x', true).
do $rewrite$
declare
  j record;
  rewritten text;
begin
  for j in select jobid, jobname, command from cron.job
           where command like '%app.settings.%'
  loop
    rewritten := j.command;
    rewritten := regexp_replace(rewritten,
      'current_setting\(\s*''app\.settings\.supabase_url''\s*(,\s*true\s*)?\)',
      'public.app_secret(''supabase_url'')', 'gi');
    rewritten := regexp_replace(rewritten,
      'current_setting\(\s*''app\.settings\.service_role_key''\s*(,\s*true\s*)?\)',
      'public.app_secret(''service_role_key'')', 'gi');

    -- pg_net 0.14 is http_post(url text, body jsonb, params jsonb, headers jsonb,
    -- timeout int). A bare string literal for url types as `unknown` and fails
    -- overload resolution, which is the second failure mode in the logs:
    -- 'function net.http_post(url => unknown, ...) does not exist'.
    rewritten := regexp_replace(rewritten,
      '(url\s*:=\s*)(''https://[^'']+'')(\s*[,)])',
      '\1\2::text\3', 'gi');

    if rewritten is distinct from j.command then
      perform cron.alter_job(j.jobid, command := rewritten);
      raise notice 'rewired %', j.jobname;
    end if;
  end loop;
end
$rewrite$;
