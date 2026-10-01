-- NON_CORE_REVIEW_2026-09 WP3 (business plan D12, first half): a sponsored
-- listing is linked to a campaign through one checked server path.
--
-- sponsored_listing_links took a browser INSERT checked only for campaign
-- ownership ("Users can insert own sponsored links", 20260303000001). So an
-- advertiser could:
--   - add a link to a campaign that was already paid for or running, and
--     sync_campaign_sponsorship would flag that listing sponsored on the next
--     status change: a second listing for the price of one;
--   - add any number of links to one sponsored_listing placement;
--   - link a campaign that bought no sponsored_listing placement at all;
--   - link a listing id that does not exist.
--
-- link_sponsored_listing(campaign, type, listing) refuses each of those: the
-- caller owns the campaign (or is an admin), the campaign is still a draft,
-- it has a sponsored_listing placement, the listing exists, and there is at
-- most one link per sponsored_listing placement. Re-linking the same listing
-- returns the existing link, so a retried request is not an error.
--
-- NOT IN THIS RELEASE, ON PURPOSE.
--   - The old INSERT policy stays. Dropping or narrowing it tightens RLS for
--     a writer shipped clients use, which CLAUDE.md (Backward Compatibility)
--     does not allow in the release that adds the replacement. The web client
--     switches to this RPC now; the policy goes in a later release, once no
--     supported client inserts directly. Tracked in
--     docs/plans/NON_CORE_REVIEW_2026-09.md WP3.
--   - Ownership of the LISTING (a verified business_claims row, or the event's
--     submitter) is D12's second half and needs a product decision about
--     events someone other than the organizer submitted.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md): a new function. Nothing else changes.

CREATE OR REPLACE FUNCTION public.link_sponsored_listing(
  p_campaign_id uuid,
  p_listing_type text,
  p_listing_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.campaigns%ROWTYPE;
  v_placements integer;
  v_links integer;
  v_link_id uuid;
BEGIN
  SELECT * INTO c FROM public.campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'link_sponsored_listing: campaign % not found', p_campaign_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_admin() OR (auth.uid() IS NOT NULL AND auth.uid() = c.user_id)) THEN
    RAISE EXCEPTION 'link_sponsored_listing: not authorized' USING ERRCODE = '42501';
  END IF;

  -- A link decides what gets flagged sponsored once the campaign is active,
  -- so it is part of what is being bought and is fixed before payment.
  IF c.status::text <> 'draft' THEN
    RAISE EXCEPTION 'link_sponsored_listing: a listing can only be linked while the campaign is a draft (this one is %)', c.status;
  END IF;

  IF p_listing_type IS NULL OR p_listing_type NOT IN ('event', 'restaurant') THEN
    RAISE EXCEPTION 'link_sponsored_listing: listing type must be event or restaurant' USING ERRCODE = '22023';
  END IF;

  IF p_listing_type = 'event' THEN
    PERFORM 1 FROM public.events WHERE id = p_listing_id;
  ELSE
    PERFORM 1 FROM public.restaurants WHERE id = p_listing_id;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'link_sponsored_listing: that % does not exist', p_listing_type USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) INTO v_placements
    FROM public.campaign_placements
   WHERE campaign_id = p_campaign_id
     AND placement_type::text = 'sponsored_listing';
  IF v_placements = 0 THEN
    RAISE EXCEPTION 'link_sponsored_listing: this campaign has no sponsored listing placement';
  END IF;

  -- The same listing again is a retry, not a second link.
  SELECT id INTO v_link_id
    FROM public.sponsored_listing_links
   WHERE campaign_id = p_campaign_id
     AND listing_type = p_listing_type
     AND listing_id = p_listing_id
   LIMIT 1;
  IF v_link_id IS NOT NULL THEN
    RETURN v_link_id;
  END IF;

  SELECT count(*) INTO v_links
    FROM public.sponsored_listing_links
   WHERE campaign_id = p_campaign_id;
  IF v_links >= v_placements THEN
    RAISE EXCEPTION 'link_sponsored_listing: this campaign already has its sponsored listing';
  END IF;

  INSERT INTO public.sponsored_listing_links (campaign_id, listing_type, listing_id)
  VALUES (p_campaign_id, p_listing_type, p_listing_id)
  RETURNING id INTO v_link_id;

  RETURN v_link_id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_sponsored_listing(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_sponsored_listing(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.link_sponsored_listing(uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.link_sponsored_listing(uuid, text, uuid) IS
  'Link a listing to a draft campaign''s sponsored_listing placement: owner or admin, draft only, one link per placement, listing must exist (NON_CORE_REVIEW WP3, D12).';
