-- Daily AI quotas and a daily spend ceiling for the public AI endpoints
-- (docs/plans/NON_CORE_REVIEW_2026-09.md, WP1).
--
-- Before this, the only brakes on nlp-search, discover-chat,
-- personalized-recommendations and generate-itinerary were per-IP/per-user
-- burst limits. provider_budgets.paused and the monthly budget stopped agents
-- (runAgent) and nothing else, so a paused budget kept spending through every
-- user-facing endpoint. discover-chat had a daily quota, but it read the count
-- and then upserted count+1, so two concurrent requests both saw N and both
-- spent. VIP was unlimited.
--
-- Three tables:
--   ai_usage_daily    one row per (subject, feature, Central date). A subject is
--                     'user:<uuid>', 'ip:<addr>' or 'global:<provider>'. The
--                     global rows are what the daily budget sums.
--   ai_quota_limits   per (tier, feature) daily call and dollar caps. Feature
--                     '*' is a per-subject cap across all features.
--   ai_global_budget  per-provider daily dollar ceiling and a kill switch.
--
-- Two RPCs, service_role only:
--   consume_ai_quota  check the kill switch, provider_budgets.paused and the
--                     daily ceiling, then take one call from the subject's
--                     quota atomically. Call BEFORE the model.
--   settle_ai_usage   add what the call actually cost, to the subject row and
--                     the global row. Call AFTER the model, including when the
--                     response was unusable - that call was billed too.
--
-- Additive only: three new tables, two new functions, seed rows.

CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
  subject    TEXT NOT NULL,
  feature    TEXT NOT NULL,
  usage_date DATE NOT NULL,
  calls      INTEGER NOT NULL DEFAULT 0,
  cost_usd   NUMERIC(12, 6) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subject, feature, usage_date)
);

-- The admin tile and the global-spend check both read one day across subjects.
CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_date
  ON public.ai_usage_daily (usage_date, subject);

CREATE TABLE IF NOT EXISTS public.ai_quota_limits (
  tier        TEXT NOT NULL CHECK (tier IN ('anon', 'free', 'insider', 'vip')),
  feature     TEXT NOT NULL,
  -- NULL = no call cap. 0 = the tier cannot use the feature.
  daily_calls INTEGER CHECK (daily_calls IS NULL OR daily_calls >= 0),
  -- NULL = no dollar cap.
  daily_usd   NUMERIC(10, 4) CHECK (daily_usd IS NULL OR daily_usd >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tier, feature)
);

CREATE TABLE IF NOT EXISTS public.ai_global_budget (
  provider    TEXT PRIMARY KEY,
  daily_usd   NUMERIC(10, 2) NOT NULL CHECK (daily_usd >= 0),
  kill_switch BOOLEAN NOT NULL DEFAULT false,
  note        TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_quota_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_global_budget ENABLE ROW LEVEL SECURITY;

-- Admin read only. No insert/update/delete policy for anon or authenticated:
-- every write goes through the SECURITY DEFINER functions below, called with
-- the service role. The owner edits limits in the SQL editor.
DO $$ BEGIN
  CREATE POLICY "ai_usage_daily_admin_read"
    ON public.ai_usage_daily FOR SELECT TO authenticated
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "ai_quota_limits_admin_read"
    ON public.ai_quota_limits FOR SELECT TO authenticated
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "ai_global_budget_admin_read"
    ON public.ai_global_budget FOR SELECT TO authenticated
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seeds. ON CONFLICT DO NOTHING so a re-run never overwrites a limit the owner
-- has since tuned.
INSERT INTO public.ai_quota_limits (tier, feature, daily_calls) VALUES
  ('anon', 'nlp-search', 50),
  ('free', 'nlp-search', 100),
  ('insider', 'nlp-search', 300),
  ('vip', 'nlp-search', 1000),
  ('anon', 'support-chat', 10),
  ('free', 'support-chat', 20),
  ('insider', 'support-chat', 50),
  ('vip', 'support-chat', 100),
  ('anon', 'discover-chat', 0),
  ('free', 'discover-chat', 5),
  ('insider', 'discover-chat', 50),
  ('vip', 'discover-chat', 200),
  ('anon', 'itinerary', 0),
  ('free', 'itinerary', 0),
  ('insider', 'itinerary', 3),
  ('vip', 'itinerary', 20),
  ('anon', 'personalized-recs', 0),
  ('free', 'personalized-recs', 10),
  ('insider', 'personalized-recs', 30),
  ('vip', 'personalized-recs', 60)
ON CONFLICT (tier, feature) DO NOTHING;

-- Per-subject dollar cap across every feature. Sized so a VIP using every
-- feature to its call cap on typical prompts stays under it; one subject
-- replaying long prompts does not.
INSERT INTO public.ai_quota_limits (tier, feature, daily_calls, daily_usd) VALUES
  ('anon', '*', NULL, 0.25),
  ('free', '*', NULL, 1.00),
  ('insider', '*', NULL, 5.00),
  ('vip', '*', NULL, 15.00)
ON CONFLICT (tier, feature) DO NOTHING;

INSERT INTO public.ai_global_budget (provider, daily_usd) VALUES
  ('anthropic', 15),
  ('openai', 5),
  ('google', 5)
ON CONFLICT (provider) DO NOTHING;

-- -----------------------------------------------------------------------------
-- consume_ai_quota
--
-- Returns jsonb:
--   { allowed: true,  calls, limit, remaining, usage_date }
--   { allowed: false, code: 'ai_budget_paused', reason: 'kill_switch'
--                     | 'provider_paused' | 'daily_budget' }
--   { allowed: false, code: 'quota_exceeded', reason: 'daily_calls'
--                     | 'feature_usd' | 'daily_usd', limit, calls }
--
-- The call cap is atomic: the increment happens in the ON CONFLICT ... WHERE
-- calls < limit, so two concurrent requests at N = limit - 1 cannot both pass.
-- The dollar checks are not - they compare spend already settled plus this
-- call's estimate, and a burst of concurrent calls can overshoot by the calls
-- in flight. That overshoot is bounded by the burst limits in front of this,
-- and the alternative (reserving estimated cost and reconciling) doubles the
-- writes on every call for cents.
--
-- An unknown tier is treated as 'anon', the most restricted row.
-- A (tier, feature) with no limits row has no call cap; the global ceiling
-- still applies.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_ai_quota(
  p_subject  TEXT,
  p_tier     TEXT,
  p_feature  TEXT,
  p_provider TEXT,
  p_est_usd  NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today        DATE := (now() AT TIME ZONE 'America/Chicago')::date;
  v_tier         TEXT := CASE WHEN p_tier IN ('anon', 'free', 'insider', 'vip') THEN p_tier ELSE 'anon' END;
  v_est          NUMERIC := GREATEST(COALESCE(p_est_usd, 0), 0);
  v_budget       public.ai_global_budget%ROWTYPE;
  v_paused       BOOLEAN;
  v_spent        NUMERIC;
  v_limit        public.ai_quota_limits%ROWTYPE;
  v_has_limit    BOOLEAN;
  v_all_usd      NUMERIC;
  v_subject_usd  NUMERIC;
  v_feature_usd  NUMERIC;
  v_calls        INTEGER;
BEGIN
  IF p_subject IS NULL OR p_subject = '' OR p_feature IS NULL OR p_feature = '' THEN
    RAISE EXCEPTION 'consume_ai_quota: subject and feature are required';
  END IF;

  -- 1. Provider-wide stops. These fail closed.
  SELECT * INTO v_budget FROM public.ai_global_budget WHERE provider = p_provider;
  IF FOUND AND v_budget.kill_switch THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'ai_budget_paused', 'reason', 'kill_switch');
  END IF;

  SELECT paused INTO v_paused FROM public.provider_budgets WHERE provider = p_provider;
  IF COALESCE(v_paused, false) THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'ai_budget_paused', 'reason', 'provider_paused');
  END IF;

  IF v_budget.provider IS NOT NULL THEN
    SELECT COALESCE(sum(cost_usd), 0) INTO v_spent
      FROM public.ai_usage_daily
     WHERE subject = 'global:' || p_provider AND usage_date = v_today;
    IF v_spent + v_est > v_budget.daily_usd THEN
      RETURN jsonb_build_object(
        'allowed', false, 'code', 'ai_budget_paused', 'reason', 'daily_budget',
        'spent_usd', v_spent, 'daily_usd', v_budget.daily_usd
      );
    END IF;
  END IF;

  -- 2. Per-subject dollar caps.
  SELECT daily_usd INTO v_all_usd FROM public.ai_quota_limits WHERE tier = v_tier AND feature = '*';
  IF v_all_usd IS NOT NULL THEN
    SELECT COALESCE(sum(cost_usd), 0) INTO v_subject_usd
      FROM public.ai_usage_daily
     WHERE subject = p_subject AND usage_date = v_today;
    IF v_subject_usd + v_est > v_all_usd THEN
      RETURN jsonb_build_object('allowed', false, 'code', 'quota_exceeded', 'reason', 'daily_usd');
    END IF;
  END IF;

  SELECT * INTO v_limit FROM public.ai_quota_limits WHERE tier = v_tier AND feature = p_feature;
  v_has_limit := FOUND;

  IF v_has_limit AND v_limit.daily_usd IS NOT NULL THEN
    SELECT COALESCE(cost_usd, 0) INTO v_feature_usd
      FROM public.ai_usage_daily
     WHERE subject = p_subject AND feature = p_feature AND usage_date = v_today;
    IF COALESCE(v_feature_usd, 0) + v_est > v_limit.daily_usd THEN
      RETURN jsonb_build_object('allowed', false, 'code', 'quota_exceeded', 'reason', 'feature_usd');
    END IF;
  END IF;

  -- 3. The call cap, atomically.
  IF v_has_limit AND v_limit.daily_calls IS NOT NULL THEN
    IF v_limit.daily_calls = 0 THEN
      RETURN jsonb_build_object(
        'allowed', false, 'code', 'quota_exceeded', 'reason', 'daily_calls', 'limit', 0, 'calls', 0
      );
    END IF;

    INSERT INTO public.ai_usage_daily AS u (subject, feature, usage_date, calls)
    VALUES (p_subject, p_feature, v_today, 1)
    ON CONFLICT (subject, feature, usage_date) DO UPDATE
      SET calls = u.calls + 1, updated_at = now()
      WHERE u.calls < v_limit.daily_calls
    RETURNING u.calls INTO v_calls;

    IF v_calls IS NULL THEN
      RETURN jsonb_build_object(
        'allowed', false, 'code', 'quota_exceeded', 'reason', 'daily_calls',
        'limit', v_limit.daily_calls, 'calls', v_limit.daily_calls
      );
    END IF;
  ELSE
    INSERT INTO public.ai_usage_daily AS u (subject, feature, usage_date, calls)
    VALUES (p_subject, p_feature, v_today, 1)
    ON CONFLICT (subject, feature, usage_date) DO UPDATE
      SET calls = u.calls + 1, updated_at = now()
    RETURNING u.calls INTO v_calls;
  END IF;

  -- Global call count per feature, for the admin view.
  INSERT INTO public.ai_usage_daily AS u (subject, feature, usage_date, calls)
  VALUES ('global:' || p_provider, p_feature, v_today, 1)
  ON CONFLICT (subject, feature, usage_date) DO UPDATE
    SET calls = u.calls + 1, updated_at = now();

  RETURN jsonb_build_object(
    'allowed', true,
    'calls', v_calls,
    'limit', CASE WHEN v_has_limit THEN v_limit.daily_calls ELSE NULL END,
    'remaining', CASE WHEN v_has_limit AND v_limit.daily_calls IS NOT NULL
                      THEN GREATEST(v_limit.daily_calls - v_calls, 0) ELSE NULL END,
    'usage_date', v_today
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- settle_ai_usage: add a call's actual cost to the subject and global rows.
-- Never touches calls; consume_ai_quota already counted the call.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_ai_usage(
  p_subject  TEXT,
  p_feature  TEXT,
  p_provider TEXT,
  p_cost_usd NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'America/Chicago')::date;
  v_cost  NUMERIC := GREATEST(COALESCE(p_cost_usd, 0), 0);
BEGIN
  IF v_cost = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.ai_usage_daily AS u (subject, feature, usage_date, cost_usd)
  VALUES (p_subject, p_feature, v_today, v_cost)
  ON CONFLICT (subject, feature, usage_date) DO UPDATE
    SET cost_usd = u.cost_usd + EXCLUDED.cost_usd, updated_at = now();

  INSERT INTO public.ai_usage_daily AS u (subject, feature, usage_date, cost_usd)
  VALUES ('global:' || p_provider, p_feature, v_today, v_cost)
  ON CONFLICT (subject, feature, usage_date) DO UPDATE
    SET cost_usd = u.cost_usd + EXCLUDED.cost_usd, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_quota(TEXT, TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_ai_usage(TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(TEXT, TEXT, TEXT, TEXT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_ai_usage(TEXT, TEXT, TEXT, NUMERIC) TO service_role;

COMMENT ON TABLE public.ai_usage_daily IS
  'Daily AI calls and cost per subject (user:/ip:/global:<provider>) and feature, Central date. Written only by consume_ai_quota / settle_ai_usage.';
COMMENT ON TABLE public.ai_quota_limits IS
  'Per-tier daily AI call and dollar caps. feature=''*'' caps a subject across all features. NULL = no cap, 0 = no access.';
COMMENT ON TABLE public.ai_global_budget IS
  'Per-provider daily AI spend ceiling and kill switch for user-facing AI endpoints. Checked by consume_ai_quota.';
