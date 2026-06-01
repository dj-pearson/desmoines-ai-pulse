-- ADMIN-TRENDING-001: Tunable weights + decay for the trending algorithm.
-- Singleton row (constraint enforces it). Edits append to
-- trending_config_history via trigger so admins can audit changes
-- without re-deriving them from a generic audit log.
--
-- Note: the existing calculate_trending_scores() PL/pgSQL function
-- in the dashboard does not yet read from this table. The follow-up
-- story will rewrite that function to look up these weights at
-- calc time. Until then the UI just stores intent.

CREATE TABLE IF NOT EXISTS public.trending_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  view_weight        NUMERIC NOT NULL DEFAULT 1.0,
  favorite_weight    NUMERIC NOT NULL DEFAULT 5.0,
  share_weight       NUMERIC NOT NULL DEFAULT 3.0,
  click_weight       NUMERIC NOT NULL DEFAULT 2.0,
  recency_half_life_hours NUMERIC NOT NULL DEFAULT 24.0,
  min_age_hours      NUMERIC NOT NULL DEFAULT 0.0,
  featured_boost     NUMERIC NOT NULL DEFAULT 10.0,
  updated_by         UUID,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the singleton row.
INSERT INTO public.trending_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.trending_config_history (
  id BIGSERIAL PRIMARY KEY,
  view_weight        NUMERIC NOT NULL,
  favorite_weight    NUMERIC NOT NULL,
  share_weight       NUMERIC NOT NULL,
  click_weight       NUMERIC NOT NULL,
  recency_half_life_hours NUMERIC NOT NULL,
  min_age_hours      NUMERIC NOT NULL,
  featured_boost     NUMERIC NOT NULL,
  changed_by         UUID,
  changed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trending_config_history_changed_at
  ON public.trending_config_history(changed_at DESC);

CREATE OR REPLACE FUNCTION public.snapshot_trending_config()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.trending_config_history (
    view_weight, favorite_weight, share_weight, click_weight,
    recency_half_life_hours, min_age_hours, featured_boost, changed_by
  ) VALUES (
    NEW.view_weight, NEW.favorite_weight, NEW.share_weight, NEW.click_weight,
    NEW.recency_half_life_hours, NEW.min_age_hours, NEW.featured_boost,
    NEW.updated_by
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_snapshot_trending_config ON public.trending_config;
CREATE TRIGGER trg_snapshot_trending_config
  AFTER UPDATE ON public.trending_config
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_trending_config();

ALTER TABLE public.trending_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trending_config_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access"
    ON public.trending_config
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin can read trending_config"
    ON public.trending_config
    FOR SELECT
    TO authenticated
    USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin can update trending_config"
    ON public.trending_config
    FOR UPDATE
    TO authenticated
    USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin can read trending_config_history"
    ON public.trending_config_history
    FOR SELECT
    TO authenticated
    USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
