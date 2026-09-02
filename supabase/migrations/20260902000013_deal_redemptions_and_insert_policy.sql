-- WEB-SEC-033: the deals module had no owner.
--
-- Two separate defects with one cause.
--
-- 1. The INSERT policy is `auth.role() = 'authenticated'` with no ownership
--    check, under a policy NAMED "Business owners and admins can insert deals".
--    The name describes an intent the predicate does not implement: any
--    signed-in account could insert a deal, and public.deals has a public SELECT
--    policy for anything inside its date window, so an inserted row is live
--    immediately. The only create UI is the admin DealManager.
--
-- 2. increment_deal_redemption is SECURITY DEFINER, granted to anon, and does
--    `redemption_count = redemption_count + 1` with no record of who redeemed.
--    A loop against the public endpoint inflates the number on every deal card,
--    and because nothing is recorded there is no way to tell an inflated count
--    from a real one afterwards, or to answer "who claimed this".
--
-- Both are fixed additively. No shape any shipped client reads changes, and the
-- RPC keeps its exact signature and parameter name -- iOS
-- (DealsService.swift:43) and Android (DealsRemoteDataSource.kt:37) both call it
-- with a named `deal_id`, and PostgREST resolves named arguments, so the
-- parameter NAME is part of the contract.

-- ---------------------------------------------------------------- 1. INSERT
-- Tightened to admins. This is a tightening, which CLAUDE.md normally splits
-- across releases -- the exception it names is a write no shipped client
-- performs. Confirmed by grep: ios/DesMoinesInsider/Services/DealsService.swift
-- and android/.../DealsRemoteDataSource.kt both only .select() from deals, and
-- the web's only insert is admin/DealManager, which runs as an admin.
--
-- Business-owner self-service is deliberately NOT added here. There is no
-- verified-claimant table yet (WEB-ADS-009), so "business owner" has nothing to
-- resolve against, and inventing an ownership column inside a security fix
-- would be a schema decision made in the wrong place.
DROP POLICY IF EXISTS "Business owners and admins can insert deals" ON public.deals;

DO $$ BEGIN
  CREATE POLICY "Admins can insert deals" ON public.deals FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------- 2. redemption ledger

-- A per-install salt, so an anonymous redemption is bucketed without an IP
-- being recoverable from what is stored. IPv4 is a 32-bit space: an unsalted
-- hash of an address is reversible by brute force in seconds, which would make
-- this table a log of visitor IP addresses in all but name.
--
-- Generated here rather than read from Vault so the migration is self-contained
-- and needs nothing from the owner. RLS on with NO policies: only SECURITY
-- DEFINER functions and service_role can read it.
CREATE TABLE IF NOT EXISTS public.deal_redemption_salt (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  salt text NOT NULL
);

ALTER TABLE public.deal_redemption_salt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deal_redemption_salt FROM anon, authenticated;

INSERT INTO public.deal_redemption_salt (id, salt)
VALUES (true, encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.deal_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  -- NULL for an anonymous claim. ON DELETE SET NULL rather than CASCADE: an
  -- account deletion must not silently reduce a deal's historical count.
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Salted hash of the client IP and user-agent. Only set for anonymous claims.
  session_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_redemptions_subject_present
    CHECK (user_id IS NOT NULL OR session_hash IS NOT NULL)
);

-- One row per account per deal, and one per anonymous bucket per deal. These
-- unique indexes ARE the per-user and per-IP cap -- a second claim conflicts
-- and does nothing, so the count cannot be looped up.
CREATE UNIQUE INDEX IF NOT EXISTS deal_redemptions_user_unique
  ON public.deal_redemptions (deal_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS deal_redemptions_session_unique
  ON public.deal_redemptions (deal_id, session_hash)
  WHERE user_id IS NULL AND session_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS deal_redemptions_deal_idx
  ON public.deal_redemptions (deal_id);

ALTER TABLE public.deal_redemptions ENABLE ROW LEVEL SECURITY;

-- No INSERT policy at all: rows arrive only through the definer function below.
-- A client that could insert directly could forge a user_id.
DO $$ BEGIN
  CREATE POLICY "Users read their own redemptions" ON public.deal_redemptions
    FOR SELECT USING (user_id IS NOT NULL AND user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins read all redemptions" ON public.deal_redemptions
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.deal_redemptions IS
  'One row per claim. Answers "who redeemed this deal" and makes the count on '
  'public.deals derived rather than incremented. WEB-SEC-033.';

-- --------------------------------------------------------------- 3. the RPC
--
-- SAME SIGNATURE AND SAME PARAMETER NAME. The parameter shadows the column of
-- the same name inside plpgsql, so every reference is qualified as
-- increment_deal_redemption.deal_id. Renaming it would be simpler to read and
-- would break both mobile clients, which send it by name.
CREATE OR REPLACE FUNCTION public.increment_deal_redemption(deal_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_hash text;
  v_headers json;
  v_salt text;
  v_count integer;
BEGIN
  -- Unknown id returns NULL rather than raising, unchanged: a stale deal link
  -- should not produce an error dialog, and every caller already treats NULL as
  -- "nothing to show".
  IF NOT EXISTS (
    SELECT 1 FROM public.deals d WHERE d.id = increment_deal_redemption.deal_id
  ) THEN
    RETURN NULL;
  END IF;

  IF v_user IS NULL THEN
    -- PostgREST publishes the request headers as a GUC. Missing (a direct SQL
    -- call, a local psql session) is tolerated: the bucket degrades to a single
    -- shared anonymous row per deal rather than erroring.
    BEGIN
      v_headers := current_setting('request.headers', true)::json;
    EXCEPTION WHEN OTHERS THEN
      v_headers := NULL;
    END;

    SELECT salt INTO v_salt FROM public.deal_redemption_salt WHERE id;

    v_hash := encode(
      extensions.digest(
        COALESCE(v_salt, '') || '|' ||
        COALESCE(v_headers ->> 'cf-connecting-ip', v_headers ->> 'x-forwarded-for', '') || '|' ||
        COALESCE(v_headers ->> 'user-agent', ''),
        'sha256'
      ),
      'hex'
    );
  END IF;

  -- ON CONFLICT DO NOTHING is the cap. A second claim by the same account, or
  -- from the same anonymous bucket, adds no row and therefore moves no count.
  INSERT INTO public.deal_redemptions (deal_id, user_id, session_hash)
  VALUES (increment_deal_redemption.deal_id, v_user, v_hash)
  ON CONFLICT DO NOTHING;

  -- DERIVED, not incremented. The counter on deals is now a cache of this
  -- table, which means a double-submit, a retry or a replayed request all
  -- converge on the same number instead of accumulating.
  SELECT count(*) INTO v_count
  FROM public.deal_redemptions r
  WHERE r.deal_id = increment_deal_redemption.deal_id;

  UPDATE public.deals
     SET redemption_count = v_count
   WHERE id = increment_deal_redemption.deal_id;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_deal_redemption(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.increment_deal_redemption(uuid) IS
  'Records one claim in deal_redemptions and returns the derived count. '
  'Idempotent per account and per anonymous bucket. WEB-SEC-033.';

-- Existing counts were produced by a bare increment with no ledger behind them,
-- so they cannot be reconciled against rows that do not exist. They are LEFT AS
-- THEY ARE rather than reset: the numbers are already displayed, and zeroing
-- every deal would be a visible content change made by a security migration.
-- The first claim after this ships overwrites the row's count with the derived
-- value, which is the honest number from that point on.
