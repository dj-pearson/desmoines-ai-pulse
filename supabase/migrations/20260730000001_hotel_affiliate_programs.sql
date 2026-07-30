-- ============================================================================
-- HOTEL-AFF-001: Brand-level affiliate program config for hotels
-- ============================================================================
-- Problem this solves
-- -------------------
-- Affiliate credentials for hotel brands lived only in edge-function env vars
-- (MARRIOTT_PARTNERIZE_CAMREF, HILTON_AWIN_MID, ...). That meant:
--   * adding/rotating a link required `supabase secrets set` + a redeploy;
--   * only the 7 hardcoded brands were supported;
--   * a newly-added hotel got no affiliate link until someone remembered to
--     run the regen function.
--
-- This migration moves the config into a table an admin can edit, and makes the
-- link generation happen in Postgres, so applying a brand's link once
-- auto-applies it to every hotel carrying that brand_parent -- now and for any
-- hotel added later.
--
-- Note on secrecy: affiliate publisher IDs are not secrets. They are visible in
-- plain text inside every outbound affiliate URL. Storing them in a table that
-- only admins can read (and only service_role can write from the edge function)
-- is not a downgrade in posture.
--
-- Backward compatibility (per CLAUDE.md):
--   * Purely additive -- new table, new functions, new triggers.
--   * hotels.affiliate_url / affiliate_provider keep their existing shape and
--     meaning, so older mobile binaries reading them are unaffected.
--   * The edge function keeps its env-var path as a fallback, so nothing breaks
--     if this table is empty.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Percent-encoding helper
-- ----------------------------------------------------------------------------
-- Postgres has no built-in URL encoder. Affiliate networks require the
-- destination URL to be percent-encoded when it is carried as a query
-- parameter, otherwise the network's redirector truncates it at the first `&`.
-- Byte-wise over UTF-8 so non-ASCII hotel URLs encode correctly.
CREATE OR REPLACE FUNCTION public.url_encode(input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
DECLARE
  bytes BYTEA := convert_to(input, 'UTF8');
  out   TEXT  := '';
  b     INT;
  i     INT;
BEGIN
  FOR i IN 0 .. octet_length(bytes) - 1 LOOP
    b := get_byte(bytes, i);
    IF  (b BETWEEN 48 AND 57)      -- 0-9
     OR (b BETWEEN 65 AND 90)      -- A-Z
     OR (b BETWEEN 97 AND 122)     -- a-z
     OR b IN (45, 46, 95, 126)     -- - . _ ~   (RFC 3986 unreserved)
    THEN
      out := out || chr(b);
    ELSE
      out := out || '%' || upper(lpad(to_hex(b), 2, '0'));
    END IF;
  END LOOP;
  RETURN out;
END;
$$;

COMMENT ON FUNCTION public.url_encode(TEXT) IS
  'RFC 3986 percent-encoding of a string, used to embed destination URLs inside affiliate redirect links.';


-- ----------------------------------------------------------------------------
-- 2. hotel_affiliate_programs -- one row per brand_parent
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hotel_affiliate_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Matches hotels.brand_parent exactly. The sentinel '*' is a catch-all used
  -- for hotels whose brand has no direct program (Independent, Drury, and any
  -- brand you haven't signed up for yet).
  brand_parent TEXT NOT NULL UNIQUE,

  -- Which network's redirect format to build. 'custom' uses link_template.
  network TEXT NOT NULL DEFAULT 'custom'
    CHECK (network IN ('impact', 'partnerize', 'cj', 'awin', 'sovrn', 'custom')),

  -- Written to hotels.affiliate_provider; shown as "via X" on the detail page.
  display_name TEXT,

  -- Credentials. Meaning is network-dependent -- see column comments below.
  account_id      TEXT,
  ad_id           TEXT,
  campaign_id     TEXT,
  tracking_domain TEXT,

  -- Free-form template for network = 'custom'. Supported placeholders:
  --   {destination}          raw destination URL
  --   {destination_encoded}  percent-encoded destination URL
  --   {subid}                sub-tracking value (see sub_id)
  link_template TEXT,

  -- Sub-tracking value passed to the network so revenue can be attributed back
  -- to this site (and, later, to a specific placement).
  sub_id TEXT NOT NULL DEFAULT 'desmoines-insider',

  -- Nothing is generated for a brand until this is flipped on.
  is_enabled BOOLEAN NOT NULL DEFAULT false,

  -- Where to apply, and operator notes. Seeded below so the admin screen is a
  -- working to-do list rather than an empty form.
  signup_url TEXT,
  status TEXT NOT NULL DEFAULT 'not_applied'
    CHECK (status IN ('not_applied', 'applied', 'approved', 'rejected', 'paused')),
  commission_notes TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hotel_affiliate_programs IS
  'Per-brand affiliate program configuration. Enabling a row auto-generates hotels.affiliate_url for every hotel with that brand_parent.';
COMMENT ON COLUMN public.hotel_affiliate_programs.brand_parent IS
  'Matches hotels.brand_parent. The sentinel ''*'' is the fallback program used by any hotel whose own brand has no enabled row.';
COMMENT ON COLUMN public.hotel_affiliate_programs.account_id IS
  'impact: partner/account ID | partnerize: camref | cj: PID (publisher ID) | awin: awinaffid';
COMMENT ON COLUMN public.hotel_affiliate_programs.ad_id IS
  'impact: ad ID | cj: advertiser link ID (AID) | awin: awinmid (merchant ID) | partnerize: unused';
COMMENT ON COLUMN public.hotel_affiliate_programs.campaign_id IS
  'impact: campaign ID. Unused by other networks.';
COMMENT ON COLUMN public.hotel_affiliate_programs.tracking_domain IS
  'impact: the brand vanity domain from your tracking link, e.g. marriott.pxf.io. Unused by other networks.';
COMMENT ON COLUMN public.hotel_affiliate_programs.link_template IS
  'network=custom only. Placeholders: {destination}, {destination_encoded}, {subid}.';

CREATE INDEX IF NOT EXISTS idx_hotel_affiliate_programs_enabled
  ON public.hotel_affiliate_programs(is_enabled);

DROP TRIGGER IF EXISTS hotel_affiliate_programs_updated_at ON public.hotel_affiliate_programs;
CREATE TRIGGER hotel_affiliate_programs_updated_at
  BEFORE UPDATE ON public.hotel_affiliate_programs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ----------------------------------------------------------------------------
-- 3. RLS -- admin-managed, service_role bypasses
-- ----------------------------------------------------------------------------
ALTER TABLE public.hotel_affiliate_programs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins manage hotel affiliate programs"
    ON public.hotel_affiliate_programs FOR ALL USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ----------------------------------------------------------------------------
-- 4. Link builder
-- ----------------------------------------------------------------------------
-- Returns the affiliate-wrapped URL for a destination, or NULL when the brand
-- has no enabled program (callers then fall back to the plain website URL).
--
-- Resolution order: exact brand_parent match, then the '*' fallback row.
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
  cfg     public.hotel_affiliate_programs%ROWTYPE;
  enc     TEXT;
  subid   TEXT;
BEGIN
  IF p_destination IS NULL OR p_destination = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO cfg
  FROM public.hotel_affiliate_programs
  WHERE is_enabled = true
    AND brand_parent = p_brand_parent
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO cfg
    FROM public.hotel_affiliate_programs
    WHERE is_enabled = true
      AND brand_parent = '*'
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  enc   := public.url_encode(p_destination);
  subid := COALESCE(NULLIF(p_sub_id, ''), cfg.sub_id, 'desmoines-insider');

  CASE cfg.network
    WHEN 'impact' THEN
      -- https://{vanity}/c/{accountId}/{adId}/{campaignId}?u={encoded}&subId1={sub}
      IF cfg.tracking_domain IS NULL OR cfg.account_id IS NULL
         OR cfg.ad_id IS NULL OR cfg.campaign_id IS NULL THEN
        RETURN NULL;
      END IF;
      RETURN format(
        'https://%s/c/%s/%s/%s?u=%s&subId1=%s',
        cfg.tracking_domain, cfg.account_id, cfg.ad_id, cfg.campaign_id,
        enc, public.url_encode(subid)
      );

    WHEN 'partnerize' THEN
      -- https://prf.hn/click/camref:{camref}/pubref:{sub}/destination:{encoded}
      IF cfg.account_id IS NULL THEN
        RETURN NULL;
      END IF;
      RETURN format(
        'https://prf.hn/click/camref:%s/pubref:%s/destination:%s',
        cfg.account_id, public.url_encode(subid), enc
      );

    WHEN 'cj' THEN
      -- https://www.anrdoezrs.net/click-{PID}-{AID}?sid={sub}&url={encoded}
      IF cfg.account_id IS NULL OR cfg.ad_id IS NULL THEN
        RETURN NULL;
      END IF;
      RETURN format(
        'https://www.anrdoezrs.net/click-%s-%s?sid=%s&url=%s',
        cfg.account_id, cfg.ad_id, public.url_encode(subid), enc
      );

    WHEN 'awin' THEN
      -- https://www.awin1.com/cread.php?awinmid={mid}&awinaffid={affid}&clickref={sub}&ued={encoded}
      IF cfg.account_id IS NULL OR cfg.ad_id IS NULL THEN
        RETURN NULL;
      END IF;
      RETURN format(
        'https://www.awin1.com/cread.php?awinmid=%s&awinaffid=%s&clickref=%s&ued=%s',
        cfg.ad_id, cfg.account_id, public.url_encode(subid), enc
      );

    WHEN 'sovrn' THEN
      -- https://redirect.viglink.com/?key={key}&u={encoded}&cuid={sub}
      IF cfg.account_id IS NULL THEN
        RETURN NULL;
      END IF;
      RETURN format(
        'https://redirect.viglink.com/?key=%s&u=%s&cuid=%s',
        cfg.account_id, enc, public.url_encode(subid)
      );

    ELSE
      -- custom: substitute placeholders into the operator-supplied template.
      IF cfg.link_template IS NULL OR cfg.link_template = '' THEN
        RETURN NULL;
      END IF;
      RETURN replace(
               replace(
                 replace(cfg.link_template, '{destination_encoded}', enc),
                 '{destination}', p_destination
               ),
               '{subid}', public.url_encode(subid)
             );
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.build_hotel_affiliate_url(TEXT, TEXT, TEXT) IS
  'Builds a brand-appropriate affiliate redirect URL from hotel_affiliate_programs. Returns NULL when the brand has no enabled program.';


-- ----------------------------------------------------------------------------
-- 5. Keep hotels.affiliate_url in sync
-- ----------------------------------------------------------------------------
-- 5a. When a hotel is inserted, or its website/brand changes, rebuild its link.
--     Skips hotels whose affiliate_url was set by hand to something that isn't
--     derived from the current program (see is_affiliate_url_managed).
ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS affiliate_url_managed BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.hotels.affiliate_url_managed IS
  'When true (default) affiliate_url is regenerated automatically from hotel_affiliate_programs. Set false to pin a hand-written link.';

CREATE OR REPLACE FUNCTION public.sync_hotel_affiliate_url()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  built    TEXT;
  provider TEXT;
BEGIN
  IF NEW.affiliate_url_managed IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  built := public.build_hotel_affiliate_url(NEW.brand_parent, NEW.website);

  IF built IS NULL THEN
    -- No enabled program for this brand. Clear a previously generated link so
    -- the UI falls back to the plain website rather than a dead redirect.
    IF TG_OP = 'UPDATE' AND OLD.affiliate_url IS NOT NULL THEN
      NEW.affiliate_url := NULL;
      NEW.affiliate_provider := NULL;
      NEW.affiliate_url_updated_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.affiliate_url IS NOT DISTINCT FROM built THEN
    RETURN NEW;  -- nothing changed, don't churn the timestamp
  END IF;

  SELECT COALESCE(p.display_name, initcap(p.network))
    INTO provider
  FROM public.hotel_affiliate_programs p
  WHERE p.is_enabled = true
    AND p.brand_parent IN (NEW.brand_parent, '*')
  ORDER BY (p.brand_parent = '*')  -- exact brand match first
  LIMIT 1;

  NEW.affiliate_url := built;
  NEW.affiliate_provider := provider;
  NEW.affiliate_url_updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hotels_sync_affiliate_url ON public.hotels;
CREATE TRIGGER hotels_sync_affiliate_url
  BEFORE INSERT OR UPDATE OF website, brand_parent, affiliate_url_managed
  ON public.hotels
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_hotel_affiliate_url();


-- 5b. When a program row is saved, re-apply it across that brand's hotels.
--     This is the "apply once, auto-applies to every link for that brand" step.
CREATE OR REPLACE FUNCTION public.reapply_hotel_affiliate_program()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  target TEXT := COALESCE(NEW.brand_parent, OLD.brand_parent);
BEGIN
  IF target = '*' THEN
    -- Fallback row changed: touch every hotel that has no enabled brand row of
    -- its own, plus any hotel with no brand at all.
    UPDATE public.hotels h
       SET website = h.website
     WHERE h.affiliate_url_managed = true
       AND NOT EXISTS (
             SELECT 1 FROM public.hotel_affiliate_programs p
              WHERE p.is_enabled = true
                AND p.brand_parent = h.brand_parent
           );
  ELSE
    UPDATE public.hotels h
       SET website = h.website
     WHERE h.affiliate_url_managed = true
       AND h.brand_parent = target;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.reapply_hotel_affiliate_program() IS
  'After a program row is inserted/updated/deleted, re-runs the hotels BEFORE-UPDATE trigger for the affected brand so links regenerate immediately.';

DROP TRIGGER IF EXISTS hotel_affiliate_programs_reapply ON public.hotel_affiliate_programs;
CREATE TRIGGER hotel_affiliate_programs_reapply
  AFTER INSERT OR UPDATE OR DELETE ON public.hotel_affiliate_programs
  FOR EACH ROW
  EXECUTE FUNCTION public.reapply_hotel_affiliate_program();


-- ----------------------------------------------------------------------------
-- 6. Seed one row per brand present in hotels, disabled, with where to apply
-- ----------------------------------------------------------------------------
-- Every row ships is_enabled = false, so this migration changes no live links.
-- Fill in the credentials in /admin/hotels -> Affiliate Programs and flip the
-- switch; the trigger above does the rest.
--
-- Sources for signup_url / network are recorded in
-- docs/HOTEL_AFFILIATE_PROGRAMS.md. Verify the network on application -- hotel
-- groups move between networks and regional programs differ.
INSERT INTO public.hotel_affiliate_programs
  (brand_parent, network, display_name, signup_url, commission_notes, notes)
VALUES
  ('Marriott', 'impact', 'Marriott Bonvoy',
   'https://marriott.pxf.io/',
   'Roughly 3-7% of room revenue, paid after the stay completes. Short cookie (~7 days).',
   'Runs on impact.com. Use a DEEP LINK (?u=<encoded property URL>), not the default creative link, or clicks land on the Bonvoy signup page instead of the hotel.'),

  ('Hilton', 'awin', 'Hilton',
   'https://ui.awin.com/merchant-profile/3624',
   'Base ~4% on participating hotels, paid after the completed stay.',
   'Runs on Awin. Needs awinmid (merchant ID) + awinaffid (your Awin publisher ID). Hilton Grand Vacations and SLH properties are excluded from the program.'),

  ('IHG', 'impact', 'IHG Hotels & Resorts',
   'https://partnerconnect.ihg.com/',
   'Percentage of room revenue on completed stays; ~7 day cookie.',
   'IHG PartnerConnect. IHG has run on both impact.com and Partnerize -- confirm which one your acceptance email puts you on and set network to match.'),

  ('Hyatt', 'impact', 'World of Hyatt',
   'https://hyatt.jewn.net/',
   'Low single-digit percent of room revenue on completed stays; short cookie.',
   'Runs on impact.com. Same deep-link caveat as Marriott -- the default link is the loyalty/enrolment creative.'),

  ('Choice', 'partnerize', 'Choice Hotels',
   'https://join.partnerize.com/choicehotels/en',
   'Reported 2-5% on completed stays; 7-day cookie on choicehotels.com.',
   'Runs on Partnerize (PHG). Needs a camref. Covers Comfort, Quality, Sleep Inn, Cambria, Country Inn & Suites.'),

  ('Wyndham', 'cj', 'Wyndham Hotels & Resorts',
   'https://signup.cj.com/member/signup/publisher/',
   'Around 3% per sale; commission reverses on cancelled/no-show stays.',
   'Runs on CJ Affiliate. Needs your CJ PID plus Wyndham''s advertiser link ID (AID). Covers Days Inn, Super 8, La Quinta, Ramada, Baymont.'),

  ('Best Western', 'cj', 'Best Western',
   'https://www.bestwestern.com/en_US/about/affiliate-program.html',
   'Around 3% per completed stay; ~30 day cookie.',
   'US program runs through CJ Affiliate. Needs CJ PID + Best Western advertiser link ID.'),

  ('Drury', 'custom', 'Drury Hotels',
   NULL,
   'No public affiliate program found as of 2026-07.',
   'Drury is privately held and runs no public affiliate program. Leave disabled so these hotels link straight to drury.com, or route them through the ''*'' fallback if you sign up for an OTA aggregator.'),

  ('Independent', 'custom', NULL,
   NULL,
   'Varies -- no single program.',
   'Independents (Surety, Hotel Fort Des Moines, etc.) have no brand program. Cover them with an OTA aggregator via the ''*'' fallback row: Stay22, Travelpayouts, Booking.com or Expedia all support deep links into a specific property.'),

  ('*', 'custom', NULL,
   'https://www.stay22.com/',
   'OTA aggregators typically pay 4-8% of the booking, some on booking rather than stay completion.',
   'FALLBACK. Used by any hotel whose own brand has no enabled program. Set network=custom and paste a template containing {destination_encoded}, e.g. https://www.stay22.com/l/YOURID?address={destination_encoded}. Leave disabled until you have signed up.')
ON CONFLICT (brand_parent) DO NOTHING;
