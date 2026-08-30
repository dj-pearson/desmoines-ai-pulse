-- AOS-CORE-011: per-category confidence-threshold tuning + a safety floor.
--
-- Adds an explicit override flag and a DB-level floor so a financial/destructive
-- category can't be set to (near) fully-auto without a deliberate override —
-- defense in depth behind the admin UI's own check. Additive only.

ALTER TABLE public.agent_registry
  ADD COLUMN IF NOT EXISTS auto_override BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.agent_registry.auto_override IS
  'When true, waives the tier1_confidence_threshold safety floor for sensitive (financial/destructive) categories (AOS-CORE-011).';

-- Floor: sensitive categories (security = destructive, manage = financial /
-- account actions) must keep tier1_confidence_threshold >= 0.80 unless
-- auto_override is set. Below that, too much runs unattended.
CREATE OR REPLACE FUNCTION public.enforce_threshold_floor()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.category IN ('security', 'manage')
     AND NEW.tier1_confidence_threshold < 0.80
     AND NEW.auto_override IS NOT TRUE THEN
    RAISE EXCEPTION 'tier1_confidence_threshold %.2f is below the 0.80 safety floor for the % category; set auto_override to override',
      NEW.tier1_confidence_threshold, NEW.category;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_agent_registry_threshold_floor ON public.agent_registry;
CREATE TRIGGER enforce_agent_registry_threshold_floor
  BEFORE INSERT OR UPDATE ON public.agent_registry
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_threshold_floor();
