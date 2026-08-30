-- cron.job_run_details had grown to 202 MB of a 372 MB database, on a 500 MB
-- free-plan cap. pg_cron appends a row per job run and never prunes, and with
-- 62 jobs (one of them firing every minute) that table was 54% of the database.
--
-- Deleting the rows loses the run history, which is the only record of which
-- jobs have been failing and since when. So roll each day up into a per-job
-- summary first: 394 days of history compressed to 6,301 rows, which is what
-- anyone actually reads it for. Then keep 7 days of raw rows for debugging.

create table if not exists public.cron_run_daily_rollup (
  jobname    text   not null,
  run_date   date   not null,
  runs       bigint not null,
  failed     bigint not null,
  last_error text,
  primary key (jobname, run_date)
);

alter table public.cron_run_daily_rollup enable row level security;

drop policy if exists "cron_run_daily_rollup_admin_read" on public.cron_run_daily_rollup;
create policy "cron_run_daily_rollup_admin_read"
  on public.cron_run_daily_rollup for select
  using (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Rolls up everything older than keep_days, then deletes it. Runs as the
-- definer so pg_cron's session can touch cron.job_run_details, which is owned
-- by supabase_admin.
create or replace function public.prune_cron_run_details(keep_days integer default 7)
returns integer
language plpgsql
security definer
set search_path = public, cron, pg_temp
as $$
declare
  cutoff timestamptz := now() - make_interval(days => keep_days);
  removed integer;
begin
  insert into public.cron_run_daily_rollup (jobname, run_date, runs, failed, last_error)
  select coalesce(j.jobname, 'jobid:' || d.jobid), d.start_time::date,
         count(*), count(*) filter (where d.status = 'failed'),
         left(max(d.return_message) filter (where d.status = 'failed'), 300)
  from cron.job_run_details d
  left join cron.job j on j.jobid = d.jobid
  where d.start_time < cutoff
  group by 1, 2
  on conflict (jobname, run_date) do update
    set runs = excluded.runs,
        failed = excluded.failed,
        last_error = excluded.last_error;

  delete from cron.job_run_details where start_time < cutoff;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_cron_run_details(integer) from public, anon, authenticated;

-- 03:10 UTC, off the hour so it does not pile onto the other nightly jobs.
select cron.unschedule('cron-run-details-retention')
where exists (select 1 from cron.job where jobname = 'cron-run-details-retention');

select cron.schedule(
  'cron-run-details-retention',
  '10 3 * * *',
  $$select public.prune_cron_run_details(7);$$
);
