-- WEB-SEC-025 AC7: make event_attendees.visibility mean something.
--
-- FOUND BY THE SWEEP AC7 ASKS FOR. Seventeen public tables carry an identity
-- column under a `USING (true)` SELECT policy. Most of them are fine: reviews,
-- tips, photos and live-feed posts are authored content where showing the author
-- IS the feature, and likes and reactions have no privacy setting to contradict.
--
-- event_attendees is the one where the DATABASE CONTRADICTS A STATED PRODUCT
-- PROMISE. It has a `visibility` column, default 'public', and the web client
-- filters every list read with .eq('visibility', 'public') -- so a row marked
-- anything else is hidden ONLY because the app chooses to hide it. Anyone
-- holding the anon key that ships in the client bundle could read every row
-- regardless. A privacy control enforced client-side is not a privacy control.
--
-- WHY THIS IS SAFE IN ONE RELEASE, which the rest of WEB-SEC-025 explicitly is
-- not. CLAUDE.md forbids "tightening an RLS policy in a way that would deny
-- reads the old client expects to succeed". Every reader was checked:
--   src/hooks/useBatchEventSocial.ts:40   .eq('visibility', 'public')
--   src/hooks/useEventSocial.ts:75        .eq('visibility', 'public')
--   src/hooks/useEventSocial.ts:99        .eq('user_id', user.id)   own row
--   src/hooks/useEventSocial.ts:245       upsert, writes visibility 'public'
--   supabase/functions/_shared/userDataTables.ts   export/erasure, SERVICE ROLE
-- and NO iOS or Android client reads this table at all -- grep across ios/ and
-- android/ returns nothing. So the new policy denies nothing any shipped client
-- asks for: the list reads already restrict themselves to public rows, and the
-- own-row read is covered by the second arm.
--
-- The votes case that opened this story needed three releases precisely because
-- all three clients DID read the raw table. This one does not, and the
-- difference is the reason, not an exception.

DROP POLICY IF EXISTS "Anyone can view attendee status" ON public.event_attendees;

/**
 * Public attendance is public; anything else is the attendee's own business.
 *
 * The two arms are separate on purpose. The first is what every list read
 * already asks for. The second is what keeps "you said you're going" working on
 * a row the user has marked private -- without it, a user who hides their
 * attendance would also hide it from themselves, and the UI would silently
 * offer to RSVP again to an event they had already RSVP'd to.
 */
CREATE POLICY "Public attendance is readable; private is own-row only"
  ON public.event_attendees
  FOR SELECT
  USING (visibility = 'public' OR auth.uid() = user_id);
