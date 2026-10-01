-- Account plan WP5 item 10 (applying it is deferred D13): profiles.email
-- follows the confirmed sign-in address.
--
-- handle_new_user (20260902000011) copies auth.users.email into profiles.email
-- once, at sign-up. Nothing updates it afterwards, so after a confirmed email
-- change /profile, the header menus and every agent that reads profiles.email
-- kept showing (and mailing) the old address. The web page now reads the
-- address from the auth user; this keeps the column honest for everything
-- else that reads it.
--
-- WHEN IT FIRES. GoTrue writes the new address into auth.users.email only when
-- the change is confirmed (until then it sits in email_change), so an AFTER
-- UPDATE OF email trigger sees confirmed addresses only. The email_confirmed_at
-- check is a second guard, not the mechanism.
--
-- IT CAN NEVER BLOCK AN AUTH WRITE. Same rule as handle_new_user: the body is
-- wrapped, and a failure logs a warning and returns NEW. A trigger on
-- auth.users that raises would stop email changes (and sign-ins, which also
-- update that row) for the whole site.
--
-- validate_profile_user_id lets this through because it checks
-- pg_trigger_depth() > 1 first, which is true for a write made from inside
-- this trigger.
--
-- Additive: a new function and a new trigger. No column, policy or grant
-- changes.

CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL
     AND NEW.email IS DISTINCT FROM OLD.email
     AND NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE public.profiles
       SET email = NEW.email,
           updated_at = now()
     WHERE user_id = NEW.id
       AND email IS DISTINCT FROM NEW.email;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_profile_email_from_auth: could not update profile for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_profile_email_from_auth() IS
'Account plan WP5 item 10. Copies a confirmed auth.users.email change into public.profiles.email. Swallows every error, because a trigger on auth.users that raises blocks auth writes for the whole site.';

REVOKE ALL ON FUNCTION public.sync_profile_email_from_auth() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_email_from_auth();
