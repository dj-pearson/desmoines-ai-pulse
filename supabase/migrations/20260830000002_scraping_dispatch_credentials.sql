-- The two scraping dispatchers never authenticate, and they fail differently.
--
-- trigger_due_scraping_jobs (cron: every 10 min) carries a service_role JWT
-- hardcoded into its body, issued 2025-07-26 and since rotated out. It is dead:
-- a request with it returns 401 from PostgREST as well as from the functions
-- gateway. It is also committed in plaintext in three migrations
-- (20250822015522, 20250823012338, 20250825174423). No longer a live
-- credential, but it should never have been written down, and it is why
-- scrape-events logged 401s all day.
--
-- run_scraping_jobs (cron: every 30 min) reads
-- vault.get_secret('SUPABASE_SERVICE_ROLE_KEY'). That function does not exist
-- on this project at any signature - supabase_vault 0.3.1 exposes
-- vault.decrypted_secrets, not get_secret - so the call raises rather than
-- returning null.
--
-- Both now use public.app_secret(), the Vault reader introduced in
-- 20260826000002, which is the one path verified to authenticate against the
-- edge runtime. Also casts the URL literal to text: pg_net's http_post is
-- (url text, body jsonb, params jsonb, headers jsonb, timeout int), and a bare
-- literal types as `unknown` and fails overload resolution.
--
-- Patched by rewriting the stored definition rather than restating 7k
-- characters of body, so the scraping logic is provably unchanged.

do $patch$
declare
  fn      text;
  src     text;
  updated text;
begin
  foreach fn in array array['trigger_due_scraping_jobs', 'run_scraping_jobs']
  loop
    select pg_get_functiondef(p.oid) into src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = fn;

    if src is null then
      raise notice 'skip % - not defined here', fn;
      continue;
    end if;

    updated := src;
    -- The dead hardcoded JWT.
    updated := regexp_replace(
      updated,
      '''Bearer eyJ[A-Za-z0-9_.\-]+''',
      '''Bearer '' || public.app_secret(''service_role_key'')',
      'g');
    -- The vault reader that does not exist.
    updated := regexp_replace(
      updated,
      '\(\s*SELECT\s+vault\.get_secret\(\s*''SUPABASE_SERVICE_ROLE_KEY''\s*\)\s*\)',
      'public.app_secret(''service_role_key'')',
      'gi');
    -- Bare URL literal types as `unknown`; pg_net wants text.
    updated := regexp_replace(
      updated,
      '(url\s*:=\s*)(''https://[^'']+'')(\s*[,)])',
      '\1\2::text\3',
      'gi');

    if updated is distinct from src then
      execute updated;
      raise notice 'patched %', fn;
    else
      raise notice 'no change needed for %', fn;
    end if;
  end loop;
end
$patch$;

-- Fail loudly if either still references a dead credential path.
do $verify$
declare
  bad text;
begin
  select string_agg(p.proname, ', ') into bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('trigger_due_scraping_jobs', 'run_scraping_jobs')
    and (pg_get_functiondef(p.oid) like '%Bearer eyJ%'
      or pg_get_functiondef(p.oid) like '%vault.get_secret%');
  if bad is not null then
    raise exception 'scraping dispatchers still carry a dead credential: %', bad;
  end if;
end
$verify$;
