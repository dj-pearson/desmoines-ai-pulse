-- WEB-SEC-030: sync_oauth_user_role copied roles by email for any caller-supplied id.
--
-- The function is SECURITY DEFINER with GRANT EXECUTE TO authenticated, and it
-- took p_user_id without ever comparing it to auth.uid(). Any signed-in user
-- could ask it to look up the roles attached to some other auth.users row and
-- write the best one it found into user_roles and profiles.user_role -- for the
-- id THEY named, not the id they are.
--
-- Exploitation needed a second auth.users row sharing the target's email, so
-- this was a hardening gap rather than a live hole. It is also the last
-- client-triggerable role write; the 2026-06-12 lockdown closed the others and
-- did not reach this one, because its signature makes it look like a helper
-- rather than a privilege path.
--
-- CREATE OR REPLACE with the SAME SIGNATURE. p_user_id stays even though
-- auth.uid() now makes it redundant: removing a parameter is a signature change
-- and older clients still send it (CLAUDE.md, "Changing or removing a function
-- or RPC parameter"). It is now validated rather than trusted.

CREATE OR REPLACE FUNCTION public.sync_oauth_user_role(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  user_email TEXT;
  target_confirmed TIMESTAMPTZ;
  existing_role TEXT;
  current_user_role TEXT;
BEGIN
  -- THE FIX. Callers may only sync themselves.
  --
  -- A NULL auth.uid() is rejected too, and deliberately: this function exists
  -- so a freshly-created OAuth user can inherit the role already attached to
  -- their email, which is a self-service operation and meaningless without a
  -- session. Anything running with no JWT -- a backfill, a service-role script
  -- -- should write public.user_roles directly, the way this migration's
  -- 20251125000001 predecessor did in its own one-time DO block, rather than
  -- borrow a function whose whole contract is "the caller is the subject".
  IF caller_id IS NULL OR caller_id <> p_user_id THEN
    RAISE EXCEPTION 'sync_oauth_user_role may only be called for the authenticated user'
      USING ERRCODE = '42501';
  END IF;

  -- Target must be a confirmed address. An unconfirmed row proves nothing about
  -- who controls the mailbox, and the whole inheritance rule below is
  -- "same email means same person".
  SELECT email, email_confirmed_at
    INTO user_email, target_confirmed
  FROM auth.users
  WHERE id = p_user_id;

  IF user_email IS NULL OR target_confirmed IS NULL THEN
    -- 'user' rather than an exception: an unconfirmed or missing row is an
    -- ordinary state during signup, not an attack, and every caller already
    -- treats 'user' as "nothing to inherit".
    RETURN 'user';
  END IF;

  -- An existing role always wins; nothing is copied over it.
  SELECT role::TEXT INTO current_user_role
  FROM public.user_roles
  WHERE user_id = p_user_id
  ORDER BY
    CASE role::TEXT
      WHEN 'root_admin' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'moderator' THEN 3
      ELSE 4
    END
  LIMIT 1;

  IF current_user_role IS NOT NULL THEN
    RETURN current_user_role;
  END IF;

  -- The source row has to be confirmed as well. Without this, anyone able to
  -- create an unconfirmed row at an admin's address could seed a role for that
  -- address and then inherit it -- the same email-trust assumption, attacked
  -- from the other end.
  SELECT ur.role::TEXT INTO existing_role
  FROM public.user_roles ur
  INNER JOIN auth.users au ON au.id = ur.user_id
  WHERE LOWER(au.email) = LOWER(user_email)
    AND ur.user_id <> p_user_id
    AND au.email_confirmed_at IS NOT NULL
  ORDER BY
    CASE ur.role::TEXT
      WHEN 'root_admin' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'moderator' THEN 3
      ELSE 4
    END
  LIMIT 1;

  IF existing_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, existing_role::public.user_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    UPDATE public.profiles
    SET user_role = existing_role::public.user_role
    WHERE user_id = p_user_id;

    RETURN existing_role;
  END IF;

  RETURN 'user';
END;
$$;

-- Unchanged: the grant is still to authenticated only. What changed is that
-- being authenticated no longer lets you name someone else.
GRANT EXECUTE ON FUNCTION public.sync_oauth_user_role(UUID) TO authenticated;

COMMENT ON FUNCTION public.sync_oauth_user_role(UUID) IS
  'Copies a role attached to the caller''s confirmed email onto the caller''s own '
  'user_roles row. Self-only: raises 42501 when p_user_id is not auth.uid(). '
  'Both the caller and the row the role is copied from must have a confirmed '
  'email. WEB-SEC-030.';
