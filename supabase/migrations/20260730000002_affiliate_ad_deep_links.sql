-- ============================================================================
-- HOTEL-AFF-002: Deep link the affiliate display banners
-- ============================================================================
-- The banner creatives in src/lib/affiliateAds.ts point at hardcoded impact.com
-- short links (marriott.pxf.io/en1QGZ, ihg.hmxg.net/5kaEq9, hyatt.jewn.net/…).
-- Those are the programs' default creatives, which land on the loyalty-program
-- enrolment page rather than anything bookable — the same problem HOTEL-AFF-001
-- fixed for the per-hotel "Book" buttons.
--
-- This migration gives each brand program a banner destination (the brand's
-- Des Moines search page) and maintains a wrapped `ad_url` for it, using the
-- same credentials the hotel links already use. The public site reads the
-- finished URL through a narrow SECURITY DEFINER function so that credentials
-- and internal columns are never exposed to anon.
--
-- Backward compatible: additive columns + a new function. Until a brand's
-- program is enabled AND has a destination set, `ad_url` stays NULL and the
-- client keeps using the existing static link in affiliateAds.ts.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Split the link builder so it can run on values not yet committed
-- ----------------------------------------------------------------------------
-- build_hotel_affiliate_url() looks the config up by brand. A BEFORE trigger on
-- hotel_affiliate_programs cannot use that — the row it needs is the NEW record,
-- which is not visible to a SELECT yet. Extract the formatting half so both
-- callers share one implementation.
CREATE OR REPLACE FUNCTION public.build_affiliate_url_from_parts(
  p_network         TEXT,
  p_account_id      TEXT,
  p_ad_id           TEXT,
  p_campaign_id     TEXT,
  p_tracking_domain TEXT,
  p_link_template   TEXT,
  p_sub_id          TEXT,
  p_destination     TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  enc   TEXT;
  subid TEXT;
BEGIN
  IF p_destination IS NULL OR p_destination = '' THEN
    RETURN NULL;
  END IF;

  enc   := public.url_encode(p_destination);
  subid := public.url_encode(COALESCE(NULLIF(p_sub_id, ''), 'desmoines-insider'));

  CASE p_network
    WHEN 'impact' THEN
      IF p_tracking_domain IS NULL OR p_account_id IS NULL
         OR p_ad_id IS NULL OR p_campaign_id IS NULL THEN
        RETURN NULL;
      END IF;
      RETURN format('https://%s/c/%s/%s/%s?u=%s&subId1=%s',
        p_tracking_domain, p_account_id, p_ad_id, p_campaign_id, enc, subid);

    WHEN 'partnerize' THEN
      IF p_account_id IS NULL THEN RETURN NULL; END IF;
      RETURN format('https://prf.hn/click/camref:%s/pubref:%s/destination:%s',
        p_account_id, subid, enc);

    WHEN 'cj' THEN
      IF p_account_id IS NULL OR p_ad_id IS NULL THEN RETURN NULL; END IF;
      RETURN format('https://www.anrdoezrs.net/click-%s-%s?sid=%s&url=%s',
        p_account_id, p_ad_id, subid, enc);

    WHEN 'awin' THEN
      IF p_account_id IS NULL OR p_ad_id IS NULL THEN RETURN NULL; END IF;
      RETURN format('https://www.awin1.com/cread.php?awinmid=%s&awinaffid=%s&clickref=%s&ued=%s',
        p_ad_id, p_account_id, subid, enc);

    WHEN 'sovrn' THEN
      IF p_account_id IS NULL THEN RETURN NULL; END IF;
      RETURN format('https://redirect.viglink.com/?key=%s&u=%s&cuid=%s',
        p_account_id, enc, subid);

    ELSE
      IF p_link_template IS NULL OR p_link_template = '' THEN RETURN NULL; END IF;
      RETURN replace(
               replace(
                 replace(p_link_template, '{destination_encoded}', enc),
                 '{destination}', p_destination
               ),
               '{subid}', subid
             );
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.build_affiliate_url_from_parts(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Formats an affiliate redirect URL from explicit credentials. Shared by build_hotel_affiliate_url (looks the row up) and the programs BEFORE trigger (has the row in hand).';

-- Re-point the brand-lookup wrapper at the shared implementation. Same
-- signature, same behaviour, no duplicated format strings.
CREATE OR REPLACE FUNCTION public.build_hotel_affiliate_url(
  p_brand_parent TEXT,
  p_destination  TEXT,
  p_sub_id       TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  cfg public.hotel_affiliate_programs%ROWTYPE;
BEGIN
  IF p_destination IS NULL OR p_destination = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO cfg
  FROM public.hotel_affiliate_programs
  WHERE is_enabled = true AND brand_parent = p_brand_parent
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO cfg
    FROM public.hotel_affiliate_programs
    WHERE is_enabled = true AND brand_parent = '*'
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN public.build_affiliate_url_from_parts(
    cfg.network, cfg.account_id, cfg.ad_id, cfg.campaign_id,
    cfg.tracking_domain, cfg.link_template,
    COALESCE(NULLIF(p_sub_id, ''), cfg.sub_id),
    p_destination
  );
END;
$$;


-- ----------------------------------------------------------------------------
-- 2. Banner destination + maintained wrapped URL
-- ----------------------------------------------------------------------------
ALTER TABLE public.hotel_affiliate_programs
  ADD COLUMN IF NOT EXISTS ad_destination_url TEXT,
  ADD COLUMN IF NOT EXISTS ad_url TEXT;

COMMENT ON COLUMN public.hotel_affiliate_programs.ad_destination_url IS
  'Where the display banner for this brand should land -- normally the brand''s Des Moines hotel search page. Must be a bookable page, not the loyalty enrolment page.';
COMMENT ON COLUMN public.hotel_affiliate_programs.ad_url IS
  'Maintained by trigger: ad_destination_url wrapped in this brand''s affiliate redirect. NULL while the program is disabled or has no destination.';

CREATE OR REPLACE FUNCTION public.sync_affiliate_ad_url()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_enabled AND NEW.ad_destination_url IS NOT NULL THEN
    NEW.ad_url := public.build_affiliate_url_from_parts(
      NEW.network, NEW.account_id, NEW.ad_id, NEW.campaign_id,
      NEW.tracking_domain, NEW.link_template, NEW.sub_id,
      NEW.ad_destination_url
    );
  ELSE
    NEW.ad_url := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hotel_affiliate_programs_sync_ad_url ON public.hotel_affiliate_programs;
CREATE TRIGGER hotel_affiliate_programs_sync_ad_url
  BEFORE INSERT OR UPDATE ON public.hotel_affiliate_programs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_affiliate_ad_url();


-- ----------------------------------------------------------------------------
-- 3. Public read path
-- ----------------------------------------------------------------------------
-- hotel_affiliate_programs is admin-only under RLS, and should stay that way --
-- it carries application status and operator notes. The public site only needs
-- the finished URL, so expose exactly that and nothing else.
--
-- Anon grant justification (matching the WEB-DB-007 convention): the banner is
-- rendered for logged-out visitors on every public page
-- (AdBanner -> AffiliateAdBanner -> useAffiliateAd), so an anon grant is
-- load-bearing here. The function takes no arguments, is read-only, and returns
-- only values that are already public in the outbound link -- there is no way to
-- use it to mint a link for an attacker-chosen destination.
CREATE OR REPLACE FUNCTION public.get_affiliate_ad_links()
RETURNS TABLE (brand_parent TEXT, display_name TEXT, ad_url TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.brand_parent, p.display_name, p.ad_url
  FROM public.hotel_affiliate_programs p
  WHERE p.is_enabled = true
    AND p.ad_url IS NOT NULL;
$$;

COMMENT ON FUNCTION public.get_affiliate_ad_links() IS
  'Public: returns the deep-linked banner URL per enabled brand. SECURITY DEFINER so anon can read past the admin-only RLS policy without seeing credentials or internal columns.';

REVOKE ALL ON FUNCTION public.get_affiliate_ad_links() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_affiliate_ad_links() TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4. Seed banner destinations
-- ----------------------------------------------------------------------------
-- Best-effort Des Moines search URLs so the field is not blank on first use.
-- VERIFY EACH ONE RESOLVES before enabling the brand -- hotel groups rewrite
-- their search URL patterns often, and a 404 destination converts at zero.
-- Nothing here goes live on its own: ad_url stays NULL until is_enabled flips.
UPDATE public.hotel_affiliate_programs SET ad_destination_url = v.url
FROM (VALUES
  ('Marriott',     'https://www.marriott.com/en-us/search/findHotels.mi?destinationAddress.city=Des+Moines&destinationAddress.stateProvince=IA&destinationAddress.country=US'),
  ('Hilton',       'https://www.hilton.com/en/search/?query=Des%20Moines%2C%20IA'),
  ('IHG',          'https://www.ihg.com/hotels/us/en/find-hotels/hotel-search?qDest=Des%20Moines%2C%20IA'),
  ('Hyatt',        'https://www.hyatt.com/search/Des%20Moines%2C%20IA'),
  ('Choice',       'https://www.choicehotels.com/iowa/des-moines/hotels'),
  ('Wyndham',      'https://www.wyndhamhotels.com/hotels/des-moines-iowa'),
  ('Best Western', 'https://www.bestwestern.com/en_US/book/hotels-in-des-moines')
) AS v(brand, url)
WHERE public.hotel_affiliate_programs.brand_parent = v.brand
  AND public.hotel_affiliate_programs.ad_destination_url IS NULL;
