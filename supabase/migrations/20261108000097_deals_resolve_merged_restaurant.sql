-- WEB-FEAT-071: a deal saved against a merged restaurant lands on the kept row.
--
-- 20261108000090 moves a restaurant's deals when the restaurant is merged.
-- It does nothing for a deal that is pointed at an already-merged row later:
-- an admin picking the duplicate in DealManager (whose venue search listed
-- merged rows until this change), a script, or an old client. That deal sat on
-- the duplicate, so the kept page's Deals section never listed it.
--
-- This BEFORE trigger resolves entity_id through restaurant_merge_survivor()
-- on every insert, and on any update that sets entity_id or entity_type. It
-- rewrites rather than refuses: refusing would turn a save that used to work
-- into an error, which CLAUDE.md treats as a tightening. A row that is not
-- merged, or whose merge chain loops, resolves to itself and is untouched.
--
-- Backward compatible: no column, policy or signature changes.

CREATE OR REPLACE FUNCTION public.resolve_deal_merged_restaurant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.entity_id := public.restaurant_merge_survivor(NEW.entity_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_deal_merged_restaurant() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_resolve_deal_merged_restaurant ON public.deals;
CREATE TRIGGER trg_resolve_deal_merged_restaurant
  BEFORE INSERT OR UPDATE OF entity_id, entity_type ON public.deals
  FOR EACH ROW
  WHEN (NEW.entity_type = 'restaurant' AND NEW.entity_id IS NOT NULL)
  EXECUTE FUNCTION public.resolve_deal_merged_restaurant();
