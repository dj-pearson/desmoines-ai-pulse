-- WEB-ADS-009: a business can claim its own listing.
--
-- grep for claim / business_claims / useClaim across src/ returns deal claims
-- and agent-task claims and nothing else. RestaurantDetails and AttractionDetails
-- carry no owner CTA, BusinessPartnership.tsx ends at a disabled "Select
-- Package" button, and the /business hub promises a portal with no verification
-- and no editing rights. So an owner who found a wrong phone number on their own
-- listing had no way to tell us and no way to fix it.
--
-- ── VERIFICATION: EMAIL DOMAIN, NOT A PHONE CODE ────────────────────────────
--
-- AC3 offers either and says the owner picks. Domain match, because it needs no
-- SMS provider, no code table and no rate-limit surface, and because the
-- evidence is already on the listing: restaurants.website and
-- known_venues.website. someone@hoytsherman.org claiming Hoyt Sherman Place is
-- the same proof a phone code gives and costs nothing to operate.
--
-- Everything else becomes a PENDING claim for a human. That is the honest
-- outcome for a gmail address, and it is most claims - which is why AC5's admin
-- queue matters and is the next slice.
--
-- ── WHAT A VERIFIED CLAIMANT MAY CHANGE ─────────────────────────────────────
--
-- RLS restricts ROWS, not columns, so an UPDATE policy scoped to "your listing"
-- would let an owner set is_featured, is_sponsored, sponsored_until, rating and
-- popularity_score - every one of which is either editorial or paid placement.
-- The column whitelist therefore lives in update_claimed_listing below, and no
-- UPDATE policy is granted on the listing tables at all.

CREATE TABLE IF NOT EXISTS public.business_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_type text NOT NULL CHECK (listing_type IN ('restaurant', 'attraction', 'venue')),
  listing_id uuid NOT NULL,
  user_id uuid NOT NULL,
  -- How it was proved. 'email_domain' is automatic; 'admin' is a human saying so.
  method text NOT NULL DEFAULT 'email_domain',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected')),
  claimed_email text,
  matched_domain text,
  admin_notes text,
  reviewed_by uuid,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One VERIFIED owner per listing. Partial, so a listing can carry several
-- pending claims (two people from one restaurant, or a dispute) while only one
-- can end up holding it.
CREATE UNIQUE INDEX IF NOT EXISTS business_claims_one_verified_owner
  ON public.business_claims (listing_type, listing_id)
  WHERE status = 'verified';

-- And one open claim per person per listing, so pressing the button twice does
-- not fill the admin queue with duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS business_claims_one_open_per_user
  ON public.business_claims (listing_type, listing_id, user_id)
  WHERE status <> 'rejected';

CREATE INDEX IF NOT EXISTS business_claims_user_idx ON public.business_claims (user_id);
CREATE INDEX IF NOT EXISTS business_claims_status_idx ON public.business_claims (status)
  WHERE status = 'pending';

ALTER TABLE public.business_claims ENABLE ROW LEVEL SECURITY;

-- Your own claims, or everything if you are an admin. Deliberately NOT public:
-- who has claimed what is commercial information about businesses that have not
-- agreed to publish it.
DROP POLICY IF EXISTS "business_claims own rows" ON public.business_claims;
CREATE POLICY "business_claims own rows"
  ON public.business_claims FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- INSERT and UPDATE go through the functions below, which is why no policy
-- grants them. A direct insert would let someone write status = 'verified'.
DROP POLICY IF EXISTS "business_claims admin write" ON public.business_claims;
CREATE POLICY "business_claims admin write"
  ON public.business_claims FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE public.business_claims IS
  'A business owner claiming their own listing (WEB-ADS-009). Written only through claim_listing and review_business_claim; there is no INSERT policy for ordinary users on purpose.';

-- ── the listing's website, whatever kind of listing it is ───────────────────
CREATE OR REPLACE FUNCTION public.listing_website(p_listing_type text, p_listing_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_site text;
BEGIN
  IF p_listing_type = 'restaurant' THEN
    SELECT website INTO v_site FROM public.restaurants WHERE id = p_listing_id;
  ELSIF p_listing_type = 'attraction' THEN
    SELECT website INTO v_site FROM public.attractions WHERE id = p_listing_id;
  ELSIF p_listing_type = 'venue' THEN
    SELECT website INTO v_site FROM public.known_venues WHERE id = p_listing_id;
  END IF;
  RETURN v_site;
END;
$$;

/**
 * The registrable-looking host of a URL or an email, lowercased, with a leading
 * "www." removed.
 *
 * NOT a public-suffix parser. It compares the last two labels, so
 * hoytsherman.org matches www.hoytsherman.org and mail.hoytsherman.org. It
 * would also match two different businesses under one co.uk, which is why the
 * ONE-label-short case below refuses instead of guessing - a false verification
 * hands someone else's listing to a stranger.
 */
CREATE OR REPLACE FUNCTION public.claim_domain_of(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
  v_labels text[];
BEGIN
  v := lower(btrim(coalesce(p_value, '')));
  IF v = '' THEN RETURN NULL; END IF;

  -- An email: everything after the last @.
  IF position('@' in v) > 0 THEN
    v := split_part(v, '@', 2);
  ELSE
    -- A URL: strip scheme, then path, query and port.
    v := regexp_replace(v, '^[a-z][a-z0-9+.-]*://', '');
    v := split_part(split_part(split_part(v, '/', 1), '?', 1), ':', 1);
  END IF;

  v := regexp_replace(v, '^www\.', '');
  IF v = '' THEN RETURN NULL; END IF;

  v_labels := string_to_array(v, '.');
  IF array_length(v_labels, 1) < 2 THEN
    RETURN NULL;
  END IF;

  RETURN array_to_string(v_labels[array_length(v_labels, 1) - 1 : array_length(v_labels, 1)], '.');
END;
$$;

-- ── claim_listing ───────────────────────────────────────────────────────────
--
-- Returns the claim's status: 'verified' when the caller's email domain matches
-- the listing's website, 'pending' otherwise. Never returns 'rejected'; only a
-- human does that.
CREATE OR REPLACE FUNCTION public.claim_listing(
  p_listing_type text,
  p_listing_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_email text;
  v_site text;
  v_site_domain text;
  v_email_domain text;
  v_status text;
  v_existing public.business_claims%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'claim_listing: sign in to claim a listing';
  END IF;
  IF p_listing_type NOT IN ('restaurant', 'attraction', 'venue') THEN
    RAISE EXCEPTION 'claim_listing: % is not a listing type', p_listing_type;
  END IF;

  -- Already settled for somebody: say so rather than queueing a claim that
  -- cannot succeed.
  SELECT * INTO v_existing
    FROM public.business_claims
   WHERE listing_type = p_listing_type AND listing_id = p_listing_id AND status = 'verified';
  IF FOUND AND v_existing.user_id <> v_user THEN
    RAISE EXCEPTION 'claim_listing: this listing is already claimed';
  END IF;

  SELECT * INTO v_existing
    FROM public.business_claims
   WHERE listing_type = p_listing_type AND listing_id = p_listing_id
     AND user_id = v_user AND status <> 'rejected';
  IF FOUND THEN
    RETURN v_existing.status;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user;
  v_site := public.listing_website(p_listing_type, p_listing_id);
  v_site_domain := public.claim_domain_of(v_site);
  v_email_domain := public.claim_domain_of(v_email);

  -- Both have to resolve AND agree. A listing with no website cannot
  -- auto-verify anyone, which is correct: there is nothing to check against.
  v_status := CASE
    WHEN v_site_domain IS NOT NULL
      AND v_email_domain IS NOT NULL
      AND v_site_domain = v_email_domain
    THEN 'verified'
    ELSE 'pending'
  END;

  INSERT INTO public.business_claims (
    listing_type, listing_id, user_id, method, status,
    claimed_email, matched_domain, verified_at
  )
  VALUES (
    p_listing_type, p_listing_id, v_user, 'email_domain', v_status,
    v_email,
    CASE WHEN v_status = 'verified' THEN v_site_domain ELSE NULL END,
    CASE WHEN v_status = 'verified' THEN now() ELSE NULL END
  );

  RETURN v_status;
END;
$$;

-- ── review_business_claim (AC5's action; the queue screen is the next slice) ─
CREATE OR REPLACE FUNCTION public.review_business_claim(
  p_claim_id uuid,
  p_approve boolean,
  p_notes text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'review_business_claim: not authorized';
  END IF;

  v_status := CASE WHEN p_approve THEN 'verified' ELSE 'rejected' END;

  UPDATE public.business_claims
  SET status = v_status,
      method = CASE WHEN p_approve THEN 'admin' ELSE method END,
      admin_notes = coalesce(p_notes, admin_notes),
      reviewed_by = auth.uid(),
      verified_at = CASE WHEN p_approve THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_claim_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'review_business_claim: claim % not found', p_claim_id;
  END IF;

  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_listing(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_listing(text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.review_business_claim(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_business_claim(uuid, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION public.listing_website(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listing_website(text, uuid) TO authenticated;

-- ── update_claimed_listing (AC4) ────────────────────────────────────────────
--
-- THE WHITELIST IS THE WHOLE POINT. RLS restricts rows, not columns, so an
-- UPDATE policy scoped to "the listing you verified" would also let an owner
-- set is_featured, is_sponsored, sponsored_until, rating and popularity_score.
-- Two of those are paid placement, which would make this a free advertising
-- button, and rating is other people's opinions. So there is no UPDATE policy
-- on restaurants, attractions or known_venues, and every owner edit comes
-- through here against a fixed column list.
--
-- HOURS ARE MISSING ON PURPOSE. restaurants has no hours column yet -
-- WEB-BE-045 writes restaurants.hours_json and is not applied. Adding it to
-- this list before the column exists would make every owner edit fail with
-- 42703, so it joins the list in the release that lands that migration.
CREATE OR REPLACE FUNCTION public.update_claimed_listing(
  p_listing_type text,
  p_listing_id uuid,
  p_patch jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_allowed text[];
  v_key text;
  v_sets text[] := '{}';
  v_table text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'update_claimed_listing: sign in first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_claims
     WHERE listing_type = p_listing_type
       AND listing_id = p_listing_id
       AND user_id = v_user
       AND status = 'verified'
  ) THEN
    RAISE EXCEPTION 'update_claimed_listing: you have not verified this listing';
  END IF;

  IF p_listing_type = 'restaurant' THEN
    v_table := 'public.restaurants';
    v_allowed := ARRAY['description', 'website', 'phone', 'image_url', 'menu_url'];
  ELSIF p_listing_type = 'attraction' THEN
    v_table := 'public.attractions';
    v_allowed := ARRAY['description', 'website', 'phone', 'image_url'];
  ELSIF p_listing_type = 'venue' THEN
    v_table := 'public.known_venues';
    v_allowed := ARRAY['website', 'phone'];
  ELSE
    RAISE EXCEPTION 'update_claimed_listing: % is not a listing type', p_listing_type;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    -- REFUSE rather than ignore. Silently dropping a field an owner filled in
    -- is how somebody spends ten minutes correcting their hours and never finds
    -- out the form threw them away.
    IF NOT (v_key = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'update_claimed_listing: % is not an owner-editable field on a %', v_key, p_listing_type;
    END IF;
    -- quote_ident on the key, and the VALUE goes through a parameter below.
    v_sets := v_sets || format('%I = ($1 ->> %L)', v_key, v_key);
  END LOOP;

  IF array_length(v_sets, 1) IS NULL THEN
    RETURN false;
  END IF;

  EXECUTE format(
    'UPDATE %s SET %s, updated_at = now() WHERE id = $2',
    v_table,
    array_to_string(v_sets, ', ')
  ) USING p_patch, p_listing_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_claimed_listing(text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_claimed_listing(text, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.update_claimed_listing(text, uuid, jsonb) IS
  'Owner edits to a claimed listing, restricted to a fixed column list (WEB-ADS-009 AC4). No UPDATE policy on the listing tables grants this - RLS cannot restrict columns.';
