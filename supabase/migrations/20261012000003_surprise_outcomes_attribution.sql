-- IOS-DD-DISCOVER-18: attribute Surprise Me outcomes to the signed-in caller.
--
-- Shipped iOS and Android clients insert surprise_pick_outcomes rows with no
-- user_id, and the insert policy (20260506000009) allows
-- `auth.uid() = user_id OR user_id IS NULL`, so every row was anonymous and
-- acceptance could not be read per user. get_surprise_pick also reads this
-- table to skip what a user just rolled past, which needs the owner.
--
-- A BEFORE INSERT trigger fills user_id from auth.uid() when the row left it
-- empty. Additive: the policy is unchanged, a row that names its user is
-- untouched, and a guest's row stays NULL. SECURITY INVOKER is enough;
-- auth.uid() reads the request's JWT either way.

CREATE OR REPLACE FUNCTION public.surprise_pick_outcome_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS surprise_pick_outcome_attribution ON public.surprise_pick_outcomes;
CREATE TRIGGER surprise_pick_outcome_attribution
  BEFORE INSERT ON public.surprise_pick_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.surprise_pick_outcome_attribution();
