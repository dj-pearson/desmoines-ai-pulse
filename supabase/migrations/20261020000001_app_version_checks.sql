-- app_version_checks: one counter row per (UTC day, platform, version) that
-- version-check has answered on THIS backend.
--
-- Why it exists: the move off Supabase Cloud (Server repo,
-- docs/desmoinesinsider-cutover/RUNBOOK.md). The new iOS and Android builds call
-- the self-hosted backend; every older build keeps calling the cloud, because
-- the backend URL is compiled in. So on the CLOUD this table counts launches of
-- builds that have not updated yet, and the cloud project can be decommissioned
-- once that count has been zero for long enough. On the self-hosted backend the
-- same table shows the new builds arriving. The ADE hub reads both
-- (hub/server/dmi/cutoverwatch.js). Without it the only drain signal is App
-- Store analytics, which lags days and does not cover Android.
--
-- What it does not store: no user, no device, no IP. A day, a platform, a
-- version string and a count.
--
-- Bounded by construction: platform is one of two values and version must look
-- like 1.2.3 (at most four numeric parts of up to four digits), so a caller
-- sending junk cannot grow the table; record_version_check refuses it.
--
-- Backward compatibility (CLAUDE.md): additive only. A new table and a new
-- function; nothing existing changes shape.

CREATE TABLE IF NOT EXISTS public.app_version_checks (
  day       date        NOT NULL,
  platform  text        NOT NULL CHECK (platform IN ('ios', 'android')),
  version   text        NOT NULL CHECK (version ~ '^[0-9]{1,4}(\.[0-9]{1,4}){0,3}$'),
  hits      integer     NOT NULL DEFAULT 0,
  first_at  timestamptz NOT NULL DEFAULT now(),
  last_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, platform, version)
);

COMMENT ON TABLE public.app_version_checks IS
  'Per-day count of version-check calls by platform and app version. Written only by version-check via record_version_check(). Read by the ADE hub to tell when old builds have stopped launching against this backend.';

-- Service role only. RLS on with no policies means anon and authenticated see
-- nothing even if a grant is added later by mistake.
ALTER TABLE public.app_version_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_version_checks FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_version_check(p_platform text, p_version text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.app_version_checks AS a (day, platform, version, hits)
  VALUES ((now() AT TIME ZONE 'utc')::date, p_platform, p_version, 1)
  ON CONFLICT (day, platform, version)
  DO UPDATE SET hits = a.hits + 1, last_at = now();
$$;

REVOKE EXECUTE ON FUNCTION public.record_version_check(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_version_check(text, text) TO service_role;
