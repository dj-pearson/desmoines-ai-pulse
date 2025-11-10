-- Add event reminders system for user notifications
-- This migration creates tables and functions for email/SMS reminders before events

-- Table: user_event_reminders
-- Stores user preferences for when they want to be reminded about events
CREATE TABLE IF NOT EXISTS public.user_event_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('1_day', '3_hours', '1_hour')),
  sent_at TIMESTAMPTZ,
  delivery_status TEXT DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  delivery_method TEXT DEFAULT 'email' CHECK (delivery_method IN ('email', 'sms', 'push')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, event_id, reminder_type)
);

-- Add indexes for efficient queries
CREATE INDEX idx_user_event_reminders_user_id ON public.user_event_reminders(user_id);
CREATE INDEX idx_user_event_reminders_event_id ON public.user_event_reminders(event_id);
CREATE INDEX idx_user_event_reminders_sent_at ON public.user_event_reminders(sent_at);
CREATE INDEX idx_user_event_reminders_pending ON public.user_event_reminders(delivery_status, sent_at)
  WHERE delivery_status = 'pending' AND sent_at IS NULL;

-- Add RLS policies
ALTER TABLE public.user_event_reminders ENABLE ROW LEVEL SECURITY;

-- Users can view their own reminders
CREATE POLICY "Users can view own reminders"
  ON public.user_event_reminders
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own reminders
CREATE POLICY "Users can insert own reminders"
  ON public.user_event_reminders
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own reminders
CREATE POLICY "Users can update own reminders"
  ON public.user_event_reminders
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own reminders
CREATE POLICY "Users can delete own reminders"
  ON public.user_event_reminders
  FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can do everything (for cron jobs)
CREATE POLICY "Service role full access"
  ON public.user_event_reminders
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Function: get_pending_reminders
-- Returns reminders that need to be sent based on event timing
CREATE OR REPLACE FUNCTION get_pending_reminders(reminder_window TEXT DEFAULT '1_hour')
RETURNS TABLE (
  reminder_id UUID,
  user_id UUID,
  user_email TEXT,
  event_id UUID,
  event_title TEXT,
  event_date TIMESTAMPTZ,
  event_start_utc TIMESTAMPTZ,
  event_venue TEXT,
  event_location TEXT,
  reminder_type TEXT,
  time_until_event INTERVAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id as reminder_id,
    r.user_id,
    u.email as user_email,
    e.id as event_id,
    e.title as event_title,
    e.date as event_date,
    e.event_start_utc,
    e.venue as event_venue,
    e.location as event_location,
    r.reminder_type,
    (COALESCE(e.event_start_utc, e.date) - now()) as time_until_event
  FROM public.user_event_reminders r
  INNER JOIN auth.users u ON r.user_id = u.id
  INNER JOIN public.events e ON r.event_id = e.id
  WHERE
    r.delivery_status = 'pending'
    AND r.sent_at IS NULL
    AND COALESCE(e.event_start_utc, e.date) > now() -- Event hasn't started yet
    AND (
      -- 1 day reminder: send when event is 24-25 hours away
      (r.reminder_type = '1_day' AND
       COALESCE(e.event_start_utc, e.date) BETWEEN now() + INTERVAL '23 hours' AND now() + INTERVAL '25 hours')
      OR
      -- 3 hours reminder: send when event is 3-4 hours away
      (r.reminder_type = '3_hours' AND
       COALESCE(e.event_start_utc, e.date) BETWEEN now() + INTERVAL '2 hours 45 minutes' AND now() + INTERVAL '3 hours 15 minutes')
      OR
      -- 1 hour reminder: send when event is 1-1.25 hours away
      (r.reminder_type = '1_hour' AND
       COALESCE(e.event_start_utc, e.date) BETWEEN now() + INTERVAL '50 minutes' AND now() + INTERVAL '70 minutes')
    )
  ORDER BY e.event_start_utc ASC;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION get_pending_reminders(TEXT) TO service_role;

-- Function: mark_reminder_sent
-- Updates reminder status after sending
CREATE OR REPLACE FUNCTION mark_reminder_sent(
  p_reminder_id UUID,
  p_status TEXT DEFAULT 'sent',
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.user_event_reminders
  SET
    delivery_status = p_status,
    sent_at = now(),
    error_message = p_error_message,
    updated_at = now()
  WHERE id = p_reminder_id;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION mark_reminder_sent(UUID, TEXT, TEXT) TO service_role;

-- Function: toggle_event_reminder
-- Helper function for users to easily toggle reminders on/off
CREATE OR REPLACE FUNCTION toggle_event_reminder(
  p_event_id UUID,
  p_reminder_type TEXT,
  p_enabled BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_result JSONB;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_enabled THEN
    -- Enable reminder (insert or do nothing if exists)
    INSERT INTO public.user_event_reminders (user_id, event_id, reminder_type)
    VALUES (v_user_id, p_event_id, p_reminder_type)
    ON CONFLICT (user_id, event_id, reminder_type) DO NOTHING;

    v_result := jsonb_build_object(
      'success', true,
      'action', 'enabled',
      'reminder_type', p_reminder_type
    );
  ELSE
    -- Disable reminder (delete)
    DELETE FROM public.user_event_reminders
    WHERE user_id = v_user_id
      AND event_id = p_event_id
      AND reminder_type = p_reminder_type;

    v_result := jsonb_build_object(
      'success', true,
      'action', 'disabled',
      'reminder_type', p_reminder_type
    );
  END IF;

  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION toggle_event_reminder(UUID, TEXT, BOOLEAN) TO authenticated;

-- Function: get_user_reminders_for_event
-- Get all reminder preferences for a specific event and user
CREATE OR REPLACE FUNCTION get_user_reminders_for_event(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_reminders JSONB;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  SELECT jsonb_object_agg(reminder_type, true)
  INTO v_reminders
  FROM public.user_event_reminders
  WHERE user_id = v_user_id
    AND event_id = p_event_id
    AND delivery_status = 'pending';

  RETURN COALESCE(
    jsonb_build_object('authenticated', true, 'reminders', v_reminders),
    jsonb_build_object('authenticated', true, 'reminders', '{}'::jsonb)
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_reminders_for_event(UUID) TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE public.user_event_reminders IS
'Stores user preferences for event reminders. Supports email, SMS, and push notifications.
Reminders are sent at 1 day, 3 hours, or 1 hour before events.';

COMMENT ON FUNCTION get_pending_reminders IS
'Returns all pending reminders that should be sent now based on event timing.
Used by the send-event-reminders edge function (cron job).';

COMMENT ON FUNCTION toggle_event_reminder IS
'Toggles a reminder on/off for the current user and specified event.
Used by the frontend reminder preferences UI.';
