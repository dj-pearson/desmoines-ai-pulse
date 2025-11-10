-- Add recurring events support
-- Allows events to repeat on schedules (weekly, monthly, custom)

-- Add recurrence fields to events table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_rule TEXT, -- RRule format (RFC 5545)
  ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES events(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS recurrence_start_date DATE,
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE,
  ADD COLUMN IF NOT EXISTS is_recurring_instance BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS instance_date DATE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_is_recurring ON public.events(is_recurring) WHERE is_recurring = true;
CREATE INDEX IF NOT EXISTS idx_events_recurrence_parent_id ON public.events(recurrence_parent_id) WHERE recurrence_parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_is_recurring_instance ON public.events(is_recurring_instance) WHERE is_recurring_instance = true;

-- Add comments for documentation
COMMENT ON COLUMN public.events.is_recurring IS
'Indicates this is a recurring event template';

COMMENT ON COLUMN public.events.recurrence_rule IS
'RRule string defining recurrence pattern (e.g., FREQ=WEEKLY;BYDAY=MO,WE,FR)';

COMMENT ON COLUMN public.events.recurrence_parent_id IS
'For recurring instances, references the parent template event';

COMMENT ON COLUMN public.events.recurrence_start_date IS
'Start date for generating recurring instances';

COMMENT ON COLUMN public.events.recurrence_end_date IS
'End date for generating recurring instances (optional)';

COMMENT ON COLUMN public.events.is_recurring_instance IS
'Indicates this is an auto-generated instance of a recurring event';

COMMENT ON COLUMN public.events.instance_date IS
'The specific date this instance occurs (for recurring instances)';

-- Function to parse simple recurrence patterns
CREATE OR REPLACE FUNCTION parse_recurrence_pattern(
  p_rule TEXT,
  p_start_date DATE,
  p_end_date DATE DEFAULT NULL,
  p_max_instances INTEGER DEFAULT 52
)
RETURNS TABLE (
  occurrence_date DATE
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_freq TEXT;
  v_interval INTEGER := 1;
  v_count INTEGER := 0;
  v_current_date DATE := p_start_date;
  v_effective_end_date DATE;
BEGIN
  -- Set effective end date (either provided or 1 year from start)
  v_effective_end_date := COALESCE(p_end_date, p_start_date + INTERVAL '1 year');

  -- Parse frequency from RRule
  -- Examples: FREQ=WEEKLY, FREQ=MONTHLY, FREQ=DAILY
  v_freq := substring(p_rule from 'FREQ=([A-Z]+)');

  -- Parse interval if present (e.g., INTERVAL=2 for every 2 weeks)
  IF p_rule ~ 'INTERVAL=' THEN
    v_interval := substring(p_rule from 'INTERVAL=([0-9]+)')::INTEGER;
  END IF;

  -- Generate occurrences based on frequency
  LOOP
    -- Check if we've reached max instances or end date
    EXIT WHEN v_count >= p_max_instances;
    EXIT WHEN v_current_date > v_effective_end_date;

    -- Return this occurrence
    occurrence_date := v_current_date;
    RETURN NEXT;

    v_count := v_count + 1;

    -- Calculate next occurrence based on frequency
    CASE v_freq
      WHEN 'DAILY' THEN
        v_current_date := v_current_date + (v_interval || ' days')::INTERVAL;
      WHEN 'WEEKLY' THEN
        v_current_date := v_current_date + (v_interval || ' weeks')::INTERVAL;
      WHEN 'MONTHLY' THEN
        v_current_date := v_current_date + (v_interval || ' months')::INTERVAL;
      WHEN 'YEARLY' THEN
        v_current_date := v_current_date + (v_interval || ' years')::INTERVAL;
      ELSE
        -- Unknown frequency, stop
        EXIT;
    END CASE;
  END LOOP;

  RETURN;
END;
$$;

-- Function to generate recurring event instances
CREATE OR REPLACE FUNCTION generate_recurring_event_instances(
  p_parent_event_id UUID,
  p_lookforward_days INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent RECORD;
  v_occurrence RECORD;
  v_instances_created INTEGER := 0;
  v_new_event_id UUID;
  v_new_date DATE;
  v_time_offset INTERVAL;
  v_new_datetime TIMESTAMPTZ;
BEGIN
  -- Get parent event details
  SELECT *
  INTO v_parent
  FROM events
  WHERE id = p_parent_event_id
    AND is_recurring = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent event not found or not a recurring event';
  END IF;

  -- Calculate time offset from date (to preserve time of day)
  v_time_offset := v_parent.event_start_utc::TIME - v_parent.date::TIMESTAMPTZ::TIME;

  -- Generate instances for each occurrence
  FOR v_occurrence IN
    SELECT occurrence_date
    FROM parse_recurrence_pattern(
      v_parent.recurrence_rule,
      COALESCE(v_parent.recurrence_start_date, v_parent.date),
      COALESCE(v_parent.recurrence_end_date, CURRENT_DATE + p_lookforward_days),
      100  -- Max 100 instances at a time
    )
    WHERE occurrence_date >= CURRENT_DATE
      AND occurrence_date <= CURRENT_DATE + p_lookforward_days
  LOOP
    v_new_date := v_occurrence.occurrence_date;

    -- Calculate new datetime maintaining the same time of day
    v_new_datetime := v_new_date::TIMESTAMPTZ + v_time_offset;

    -- Check if instance already exists for this date
    IF NOT EXISTS (
      SELECT 1
      FROM events
      WHERE recurrence_parent_id = p_parent_event_id
        AND instance_date = v_new_date
    ) THEN
      -- Create new instance
      INSERT INTO events (
        title,
        date,
        location,
        category,
        image_url,
        price,
        venue,
        original_description,
        enhanced_description,
        is_featured,
        event_start_utc,
        event_start_local,
        city,
        latitude,
        longitude,
        source_url,
        is_recurring_instance,
        recurrence_parent_id,
        instance_date,
        created_at,
        updated_at
      )
      SELECT
        v_parent.title || ' - ' || TO_CHAR(v_new_date, 'Mon DD'),
        v_new_date,
        v_parent.location,
        v_parent.category,
        v_parent.image_url,
        v_parent.price,
        v_parent.venue,
        v_parent.original_description,
        v_parent.enhanced_description,
        false, -- Instances are not featured by default
        v_new_datetime,
        v_new_datetime AT TIME ZONE 'America/Chicago',
        v_parent.city,
        v_parent.latitude,
        v_parent.longitude,
        v_parent.source_url,
        true,
        p_parent_event_id,
        v_new_date,
        NOW(),
        NOW()
      RETURNING id INTO v_new_event_id;

      v_instances_created := v_instances_created + 1;

      RAISE NOTICE 'Created instance % for date %', v_new_event_id, v_new_date;
    END IF;
  END LOOP;

  RETURN v_instances_created;
END;
$$;

-- Function to regenerate all recurring event instances
CREATE OR REPLACE FUNCTION regenerate_all_recurring_instances()
RETURNS TABLE (
  parent_event_id UUID,
  parent_title TEXT,
  instances_created INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent RECORD;
  v_created INTEGER;
BEGIN
  -- Loop through all active recurring events
  FOR v_parent IN
    SELECT id, title
    FROM events
    WHERE is_recurring = true
      AND (recurrence_end_date IS NULL OR recurrence_end_date >= CURRENT_DATE)
  LOOP
    -- Generate instances for this parent
    v_created := generate_recurring_event_instances(v_parent.id, 90);

    -- Return result
    parent_event_id := v_parent.id;
    parent_title := v_parent.title;
    instances_created := v_created;

    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

-- Function to clone an event (for easy duplication)
CREATE OR REPLACE FUNCTION clone_event(
  p_event_id UUID,
  p_new_date DATE DEFAULT NULL,
  p_new_title TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source RECORD;
  v_new_event_id UUID;
  v_new_date DATE;
  v_new_datetime TIMESTAMPTZ;
  v_time_offset INTERVAL;
BEGIN
  -- Get source event
  SELECT *
  INTO v_source
  FROM events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source event not found';
  END IF;

  -- Set new date (default to 7 days from original)
  v_new_date := COALESCE(p_new_date, v_source.date + INTERVAL '7 days');

  -- Calculate time offset
  v_time_offset := v_source.event_start_utc::TIME - v_source.date::TIMESTAMPTZ::TIME;
  v_new_datetime := v_new_date::TIMESTAMPTZ + v_time_offset;

  -- Create cloned event
  INSERT INTO events (
    title,
    date,
    location,
    category,
    image_url,
    price,
    venue,
    original_description,
    enhanced_description,
    is_featured,
    event_start_utc,
    event_start_local,
    city,
    latitude,
    longitude,
    source_url,
    created_at,
    updated_at
  )
  VALUES (
    COALESCE(p_new_title, v_source.title || ' (Copy)'),
    v_new_date,
    v_source.location,
    v_source.category,
    v_source.image_url,
    v_source.price,
    v_source.venue,
    v_source.original_description,
    v_source.enhanced_description,
    false, -- Don't copy featured status
    v_new_datetime,
    v_new_datetime AT TIME ZONE 'America/Chicago',
    v_source.city,
    v_source.latitude,
    v_source.longitude,
    v_source.source_url,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_new_event_id;

  RETURN v_new_event_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION parse_recurrence_pattern(TEXT, DATE, DATE, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION generate_recurring_event_instances(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION regenerate_all_recurring_instances() TO service_role;
GRANT EXECUTE ON FUNCTION clone_event(UUID, DATE, TEXT) TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION parse_recurrence_pattern IS
'Parses RRule string and returns array of occurrence dates';

COMMENT ON FUNCTION generate_recurring_event_instances IS
'Generates future instances of a recurring event (called by cron job)';

COMMENT ON FUNCTION regenerate_all_recurring_instances IS
'Regenerates instances for all active recurring events (scheduled task)';

COMMENT ON FUNCTION clone_event IS
'Clones an existing event to a new date (useful for one-off duplicates)';
