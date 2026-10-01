-- IOS-DD-PLATFORM-19: the table register-device-token writes to.
--
-- register-device-token has upserted into public.device_tokens since
-- IOS-AUDIT-FEAT-001, but no migration ever created it, so every call would
-- have answered 42P01. It is latent only because Config.enablePushNotifications
-- ships false on iOS.
--
-- A token is unique on its own, not per (user_id, device_token): the device
-- belongs to whoever signed in on it last, so a shared phone no longer
-- receives every account's alerts. The function writes with the service role,
-- so there is no insert policy and no anon access; a signed-in user may read
-- and delete only their own rows.
--
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_tokens_device_token_key UNIQUE (device_token)
);

CREATE INDEX IF NOT EXISTS device_tokens_user_id_idx ON public.device_tokens (user_id);

-- register-device-token upserts ON CONFLICT (device_token). If the table was
-- created by hand before this migration (no migration ever created it), the
-- CREATE TABLE above is skipped and that unique key may be missing, which
-- would fail every registration. Keep one row per token, then make
-- sure the key exists. A no-op when the table was created just above: the
-- constraint's index already has this name. ctid, not id/updated_at, because
-- a hand-made table may lack those columns; the survivor is arbitrary but the
-- next registration re-owns the token anyway.
DELETE FROM public.device_tokens a
USING public.device_tokens b
WHERE a.device_token = b.device_token
  AND a.ctid < b.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_device_token_key
  ON public.device_tokens (device_token);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS device_tokens_select_own ON public.device_tokens;
CREATE POLICY device_tokens_select_own ON public.device_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS device_tokens_delete_own ON public.device_tokens;
CREATE POLICY device_tokens_delete_own ON public.device_tokens
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- A signed-in client may write only its own rows. Moving a token between
-- users stays with register-device-token (service_role); the UPDATE policy's
-- USING clause means a client can never touch a row another user holds.
-- src/hooks/usePushNotifications.ts upserts here directly, and
-- check-upsert-update-policy requires an UPDATE policy for that. (It also
-- writes token/is_active, which this table does not have - a pre-existing
-- web bug, noted in docs/ios-deep-dive/12-platform.md.)
DROP POLICY IF EXISTS device_tokens_insert_own ON public.device_tokens;
CREATE POLICY device_tokens_insert_own ON public.device_tokens
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS device_tokens_update_own ON public.device_tokens;
CREATE POLICY device_tokens_update_own ON public.device_tokens
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.device_tokens FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;
