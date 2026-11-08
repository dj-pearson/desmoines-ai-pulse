-- WEB-FEAT-069: a restaurant merge moves that restaurant's deals to the kept row.
--
-- merge_duplicate_content() (20260612000010) repoints every single-column
-- foreign key that references restaurants.id. deals.entity_id is polymorphic
-- (restaurant, attraction, hotel, ...) and has no foreign key, so a deal
-- curated against a duplicate stayed on the duplicate after the merge. Three
-- surfaces then disagreed:
--   * /deals linked the deal to the duplicate's page, which redirects to the
--     kept row;
--   * the kept row's Deals section lists deals by its own id, so the deal the
--     visitor clicked was not on the page they landed on;
--   * the Happy hour now strip linked the duplicate's slug the same way.
--
-- The fix is a trigger on restaurants rather than a rewrite of
-- merge_duplicate_content(): whatever marks a row merged (that function, an
-- admin UPDATE, a script) moves its deals, and the merge function is left as
-- it is. unmerge_content() keeps repointed children with the survivor, by its
-- own comment, and deals follow the same rule.
--
-- Backward compatible: no column, policy or signature changes. Old clients
-- read deals.entity_id exactly as before; it now names a row they can show.

-- The row a merged restaurant finally resolves to: follow merged_into while
-- the target is itself merged, stopping after 10 hops. Returns the input when
-- it is not merged or its chain loops back on itself.
CREATE OR REPLACE FUNCTION public.restaurant_merge_survivor(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current uuid := p_id;
  v_next uuid;
  v_seen uuid[] := ARRAY[p_id];
BEGIN
  FOR i IN 1..10 LOOP
    SELECT r.merged_into INTO v_next
    FROM public.restaurants r
    WHERE r.id = v_current AND r.is_merged AND r.merged_into IS NOT NULL;
    EXIT WHEN v_next IS NULL;
    -- A cycle has no kept row to move anything to.
    IF v_next = ANY (v_seen) THEN
      RETURN p_id;
    END IF;
    v_seen := v_seen || v_next;
    v_current := v_next;
  END LOOP;
  RETURN v_current;
END;
$$;

REVOKE ALL ON FUNCTION public.restaurant_merge_survivor(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.repoint_deals_on_restaurant_merge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_survivor uuid;
BEGIN
  v_survivor := public.restaurant_merge_survivor(NEW.id);
  IF v_survivor IS NOT NULL AND v_survivor <> NEW.id THEN
    UPDATE public.deals
      SET entity_id = v_survivor
      WHERE entity_type = 'restaurant' AND entity_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.repoint_deals_on_restaurant_merge() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_repoint_deals_on_restaurant_merge ON public.restaurants;
CREATE TRIGGER trg_repoint_deals_on_restaurant_merge
  AFTER UPDATE OF is_merged, merged_into ON public.restaurants
  FOR EACH ROW
  WHEN (NEW.is_merged AND NEW.merged_into IS NOT NULL AND NEW.merged_into <> NEW.id)
  EXECUTE FUNCTION public.repoint_deals_on_restaurant_merge();

-- Backfill: deals already sitting on a merged restaurant move to the row it
-- resolves to. Rows whose chain ends in a cycle resolve to themselves and are
-- left alone.
UPDATE public.deals d
  SET entity_id = public.restaurant_merge_survivor(d.entity_id)
  FROM public.restaurants r
  WHERE d.entity_type = 'restaurant'
    AND d.entity_id = r.id
    AND r.is_merged
    AND r.merged_into IS NOT NULL
    AND public.restaurant_merge_survivor(d.entity_id) <> d.entity_id;
