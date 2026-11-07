-- ============================================================================
-- contact_submissions: an insert may only name its own user_id (or none)
-- ============================================================================
-- The insert policy from 20251202000000_add_contact_submissions.sql was
-- WITH CHECK (true), so the anon key could write a row carrying any user_id.
-- mirror_contact_to_support() (20260709000035_support_tickets.sql) copies
-- NEW.user_id into support_tickets, which put an anonymous message, with the
-- sender's own email as contact_email, into the victim's Support inbox, and
-- support-console reported that ticket as "authenticated" with the victim's
-- subscription attached.
--
-- The form stays open to signed-out visitors: user_id IS NULL is still
-- accepted. A signed-in visitor may tag the row with their own id and nobody
-- else's. Anonymous callers have auth.uid() = NULL, so they can only insert
-- user_id NULL.
--
-- Writers checked on 2026-11-01: the only client insert is
-- src/hooks/useContactForm.ts (user_id: user?.id || null, from the same
-- session that signs the request), used by the contact page,
-- PartnershipInquiryForm and GroupTravel. No iOS/Android/mobile-app code and
-- no edge function inserts into contact_submissions. The service role bypasses
-- RLS and is unaffected.
--
-- Backward compatibility: this tightens an INSERT policy, but only for rows
-- naming a user other than the caller, which no shipped client sends.
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can submit contact form" ON public.contact_submissions;

CREATE POLICY "Anyone can submit contact form" ON public.contact_submissions
  FOR INSERT
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
