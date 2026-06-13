-- DEAL-RECURRING-001: recurring-rule columns so deals can express
-- "happy hour Tue-Thu 4-6pm" instead of just a date range.

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS days_of_week TEXT[],
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME;

-- Enforce that every entry in days_of_week is a valid abbreviation.
-- CHECK constraints can't contain subqueries, so use the array-containment
-- operator (<@): every element of days_of_week must be in the allowed set.
-- Empty array passes; NULL is handled by the explicit IS NULL branch.
DO $$ BEGIN
  ALTER TABLE public.deals
    ADD CONSTRAINT deals_days_of_week_valid
    CHECK (
      days_of_week IS NULL
      OR days_of_week <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']::TEXT[]
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enforce both times set or neither — partial specifications would
-- render ambiguously in the public UI.
DO $$ BEGIN
  ALTER TABLE public.deals
    ADD CONSTRAINT deals_recurrence_times_paired
    CHECK (
      (start_time IS NULL AND end_time IS NULL)
      OR (start_time IS NOT NULL AND end_time IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.deals.days_of_week IS
  'Days the deal recurs: subset of {mon,tue,wed,thu,fri,sat,sun}. Empty / NULL = no recurrence.';
COMMENT ON COLUMN public.deals.start_time IS
  'Daily start time (paired with end_time). NULL means all-day.';
