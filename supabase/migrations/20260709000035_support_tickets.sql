-- AOS-CS-001: unified support intake. Every support request (contact form,
-- support email, in-app) lands in one place: support_tickets + support_messages.
-- The existing contact form is UNCHANGED — a SECURITY DEFINER trigger on
-- contact_submissions mirrors each submission into a ticket, so the public
-- contact endpoint shape and its anti-abuse (RLS insert + rate limit) stay
-- intact. Additive only.

-- ── Enums ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE support_channel AS ENUM ('web_form', 'email', 'in_app');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE support_ticket_status AS ENUM ('new', 'ai_handling', 'awaiting_user', 'escalated', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE support_sender AS ENUM ('user', 'agent', 'admin', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tickets ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,        -- nullable: unauthenticated intake
  channel support_channel NOT NULL DEFAULT 'web_form',
  subject TEXT,
  body TEXT NOT NULL,
  status support_ticket_status NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'normal',                          -- low | normal | high | urgent
  sentiment TEXT,                                                   -- set by AOS-CS-005 classifier
  category TEXT,                                                    -- mirrors inquiry_type; refined later
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_email TEXT,                                              -- for unauthenticated repliers
  source_ref UUID,                                                 -- provenance (e.g. contact_submissions.id)
  sla_due_at TIMESTAMPTZ,                                          -- set by AOS-CS-005
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_support_tickets_source_ref ON public.support_tickets (source_ref) WHERE source_ref IS NOT NULL;

-- ── Messages (thread) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender support_sender NOT NULL DEFAULT 'user',
  body TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON public.support_messages (ticket_id, created_at);

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Users see their own tickets; admins see all; service role (agents) bypasses RLS.
DO $$ BEGIN
  CREATE POLICY "support_tickets_user_read" ON public.support_tickets
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "support_tickets_admin_read" ON public.support_tickets
    FOR SELECT TO authenticated USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "support_tickets_admin_update" ON public.support_tickets
    FOR UPDATE TO authenticated USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Authenticated users may open their own in-app ticket (service role handles the rest).
DO $$ BEGIN
  CREATE POLICY "support_tickets_user_insert" ON public.support_tickets
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Messages follow ticket visibility.
DO $$ BEGIN
  CREATE POLICY "support_messages_user_read" ON public.support_messages
    FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "support_messages_admin_read" ON public.support_messages
    FOR SELECT TO authenticated USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "support_messages_user_insert" ON public.support_messages
    FOR INSERT TO authenticated WITH CHECK (
      EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── updated_at trigger ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_support_ticket_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_support_ticket_updated_at();

-- ── Mirror contact_submissions → support_tickets (UNCHANGED contact path) ─
-- SECURITY DEFINER so an anonymous contact-form insert can create the ticket
-- without a public INSERT policy on support_tickets. Idempotent via source_ref.
CREATE OR REPLACE FUNCTION public.mirror_contact_to_support()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_ticket_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.support_tickets WHERE source_ref = NEW.id) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.support_tickets (user_id, channel, subject, body, status, priority, category, contact_email, source_ref, created_at)
  VALUES (
    NEW.user_id,
    'web_form',
    COALESCE(NEW.subject, 'Contact: ' || COALESCE(NEW.inquiry_type, 'general')),
    NEW.message,
    'new',
    COALESCE(NEW.priority, 'normal'),
    NEW.inquiry_type,
    NEW.email,
    NEW.id,
    COALESCE(NEW.created_at, now())
  )
  RETURNING id INTO new_ticket_id;

  INSERT INTO public.support_messages (ticket_id, sender, body, metadata)
  VALUES (new_ticket_id, 'user', NEW.message, jsonb_build_object('name', NEW.name, 'email', NEW.email, 'source_page', NEW.source_page));

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_mirror_contact_to_support ON public.contact_submissions;
CREATE TRIGGER trg_mirror_contact_to_support
  AFTER INSERT ON public.contact_submissions
  FOR EACH ROW EXECUTE FUNCTION public.mirror_contact_to_support();

-- ── Backfill existing contact submissions (one-time, idempotent) ──────────
INSERT INTO public.support_tickets (user_id, channel, subject, body, status, priority, category, contact_email, source_ref, created_at)
SELECT cs.user_id, 'web_form',
       COALESCE(cs.subject, 'Contact: ' || COALESCE(cs.inquiry_type, 'general')),
       cs.message, 'new', COALESCE(cs.priority, 'normal'), cs.inquiry_type, cs.email, cs.id, COALESCE(cs.created_at, now())
FROM public.contact_submissions cs
WHERE NOT EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.source_ref = cs.id);

INSERT INTO public.support_messages (ticket_id, sender, body, metadata)
SELECT t.id, 'user', cs.message, jsonb_build_object('name', cs.name, 'email', cs.email, 'backfilled', true)
FROM public.contact_submissions cs
JOIN public.support_tickets t ON t.source_ref = cs.id
WHERE NOT EXISTS (SELECT 1 FROM public.support_messages m WHERE m.ticket_id = t.id);

COMMENT ON TABLE public.support_tickets IS
  'Unified support intake (AOS-CS-001): web_form (mirrored from contact_submissions), email, in_app. RLS: users see own, admins all, agents (service role) write.';
COMMENT ON TABLE public.support_messages IS
  'Support ticket thread (AOS-CS-001). Sender: user | agent | admin | system.';
