-- IOS-AUDIT-BUG-017: idempotency keys for queued telemetry inserts.
--
-- THE BUG. SwipeInteractionService and AdTrackingService both queue rows while
-- offline and flush them later. Both treat "the insert threw" as "the insert did
-- not happen" and keep the batch for the next attempt. A lost RESPONSE - the
-- write committed, the reply never arrived, which is the ordinary shape of a
-- mobile connection dropping - is indistinguishable from a lost REQUEST at the
-- client, so the next flush inserts the same rows again. Nothing errors and
-- nothing looks wrong; the swipe counts and impression counts are simply too
-- high, by an amount that scales with how bad the user's connection is.
--
-- THE KEY IS GENERATED WHEN THE ROW IS QUEUED, not when it is sent. A key minted
-- at send time is a different key on the retry and dedupes nothing.
--
-- WHY THE COLUMN IS NULLABLE. Every shipped binary inserts these rows without a
-- client_event_id, and per CLAUDE.md they keep working until
-- MIN_SUPPORTED_APP_VERSION excludes them. NOT NULL would be a tightening.
-- Postgres treats NULLs as distinct in a unique index, so an old client's rows
-- never collide with each other or with anything else.
--
-- WHY THE INDEX IS NOT PARTIAL, which is the non-obvious part. The natural
-- shape is `WHERE client_event_id IS NOT NULL` - smaller index, intent stated in
-- the schema. It does not work. PostgREST's upsert emits
-- `ON CONFLICT (client_event_id) DO NOTHING` with no WHERE clause, and Postgres
-- can only infer a PARTIAL index when the statement's own predicate implies the
-- index predicate. Against the partial version that insert fails outright with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" - verified against this database before this was written. A
-- plain unique index over the nullable column gives the same guarantee and is
-- the one the client can actually use.
--
-- Additive: new nullable columns, new indexes, no policy and no signature
-- touched.

ALTER TABLE public.swipe_interactions
  ADD COLUMN IF NOT EXISTS client_event_id uuid;

ALTER TABLE public.ad_impressions
  ADD COLUMN IF NOT EXISTS client_event_id uuid;

ALTER TABLE public.ad_clicks
  ADD COLUMN IF NOT EXISTS client_event_id uuid;

-- Unique so ON CONFLICT DO NOTHING has something to conflict against.
CREATE UNIQUE INDEX IF NOT EXISTS swipe_interactions_client_event_id_key
  ON public.swipe_interactions (client_event_id);

CREATE UNIQUE INDEX IF NOT EXISTS ad_impressions_client_event_id_key
  ON public.ad_impressions (client_event_id);

CREATE UNIQUE INDEX IF NOT EXISTS ad_clicks_client_event_id_key
  ON public.ad_clicks (client_event_id);

COMMENT ON COLUMN public.swipe_interactions.client_event_id IS
  'Client-generated idempotency key, minted when the row is queued (IOS-AUDIT-BUG-017). NULL for clients predating the column.';
COMMENT ON COLUMN public.ad_impressions.client_event_id IS
  'Client-generated idempotency key, minted when the row is queued (IOS-AUDIT-BUG-017). NULL for clients predating the column.';
COMMENT ON COLUMN public.ad_clicks.client_event_id IS
  'Client-generated idempotency key, minted when the row is queued (IOS-AUDIT-BUG-017). NULL for clients predating the column.';
