-- FEEDBACK-REPLY-001: thread of admin / user messages on a contact submission.
-- The direction column supports inbound parsing in a future story; for
-- now we only ever insert admin_to_user rows.

CREATE TABLE IF NOT EXISTS public.feedback_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.contact_submissions(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'admin_to_user'
    CHECK (direction IN ('admin_to_user', 'user_to_admin')),
  body_html TEXT NOT NULL,
  sent_by UUID,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resend_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_replies_submission
  ON public.feedback_replies(submission_id, sent_at DESC);

ALTER TABLE public.feedback_replies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access"
    ON public.feedback_replies
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin can read replies"
    ON public.feedback_replies
    FOR SELECT
    TO authenticated
    USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin can insert replies"
    ON public.feedback_replies
    FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
