-- WEB-BE-065: one lifecycle answer for "is this restaurant closed".
--
-- Two columns say a restaurant is closed and their writers disagreed: the
-- Places refresh writes business_status and never status; the admin "Mark as
-- Closed" button writes status = 'closed' and never business_status. Every
-- reader had to apply both NOT_CLOSED_RESTAURANT_FILTER and
-- NOT_GOOGLE_CLOSED_RESTAURANT_FILTER (src/lib/restaurantStatus.ts), and one
-- that applied only the first showed places Google had closed.
--
-- THE RULE (enforced here, for every writer, in the same statement):
--   When business_status BECOMES 'CLOSED_PERMANENTLY' (an insert with that
--   value, or an update that changes it to that value) and the same statement
--   does not set status itself, status becomes 'closed'.
--
--   Only a change counts. A person who reopens a listing that Google still
--   calls CLOSED_PERMANENTLY is not re-closed by the next refresh, because the
--   refresh writes the same answer again. Google has to say something newer
--   that contradicts the person: move off CLOSED_PERMANENTLY and back.
--
--   A statement that sets status explicitly always wins (a person's decision).
--
-- status_changed_at / status_changed_by record who last moved status:
--   'places'           this trigger, from a Google answer
--   'places-backfill'  the one-off backfill below
--   'person:<uuid>'    a signed-in user (admin edit, owner)
--   'service'          a service-role job with no user
--
-- Additive only: both columns stay and both keep being written; no filter,
-- CHECK or column is removed or tightened. iOS and Android read both columns
-- (ios/DesMoinesInsider/Models/Restaurant.swift) and see the same shapes.
-- Dropping either reader filter is a later release, after this dual write has
-- been observed in production.

ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS status_changed_by text;

-- One-off backfill, before the trigger is (re)created so it records its own
-- actor. The SEO-059 data pass did this once by hand; rows Google closed
-- afterwards drifted again.
DROP TRIGGER IF EXISTS trg_sync_restaurant_closed_flags ON public.restaurants;
DO $$
DECLARE
  n integer;
BEGIN
  UPDATE public.restaurants
     SET status = 'closed',
         status_changed_at = now(),
         status_changed_by = 'places-backfill'
   WHERE business_status = 'CLOSED_PERMANENTLY'
     AND status IS DISTINCT FROM 'closed';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'WEB-BE-065 backfill: % restaurant(s) Google marks CLOSED_PERMANENTLY now have status = closed', n;
END
$$;

CREATE OR REPLACE FUNCTION public.sync_restaurant_closed_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  became_closed boolean;
  status_set_by_statement boolean;
BEGIN
  became_closed := NEW.business_status = 'CLOSED_PERMANENTLY'
    AND (TG_OP = 'INSERT' OR OLD.business_status IS DISTINCT FROM 'CLOSED_PERMANENTLY');
  status_set_by_statement := TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status;

  IF became_closed AND NOT status_set_by_statement AND NEW.status IS DISTINCT FROM 'closed' THEN
    NEW.status := 'closed';
    NEW.status_changed_at := now();
    NEW.status_changed_by := 'places';
    RETURN NEW;
  END IF;

  IF status_set_by_statement THEN
    BEGIN
      v_uid := auth.uid();
    EXCEPTION WHEN OTHERS THEN
      v_uid := NULL;
    END;
    NEW.status_changed_at := now();
    NEW.status_changed_by := CASE WHEN v_uid IS NULL THEN 'service' ELSE 'person:' || v_uid::text END;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER trg_sync_restaurant_closed_flags
  BEFORE INSERT OR UPDATE OF business_status, status ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.sync_restaurant_closed_flags();
