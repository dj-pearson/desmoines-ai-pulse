-- WEB-ADS-011 AC4: an abandoned checkout must be able to tell the advertiser.
--
-- stripe-webhook now handles checkout.session.expired by returning the campaign
-- from pending_payment to draft, so the advertiser can start a new checkout
-- instead of owning a row that is stuck forever. The notification that says so
-- needs a type, and campaign_notifications.notification_type is a CHECK list of
-- eleven values with nothing for this.
--
-- WIDENING a CHECK is additive and safe in one release (CLAUDE.md, Backward
-- Compatibility); TIGHTENING one is what needs the multi-release flow. Every
-- value that was allowed before is still allowed, so no existing writer can
-- start failing.
--
-- The webhook treats the notification as best-effort on purpose: if this
-- migration has not been applied, the insert fails the CHECK and is LOGGED
-- rather than thrown, so the status revert - the part that actually unsticks
-- the advertiser - still happens and Stripe is not made to retry the event.

ALTER TABLE public.campaign_notifications
  DROP CONSTRAINT IF EXISTS campaign_notifications_notification_type_check;

ALTER TABLE public.campaign_notifications
  ADD CONSTRAINT campaign_notifications_notification_type_check
  CHECK (notification_type IN (
    'campaign_created',
    'payment_received',
    'creative_uploaded',
    'creative_approved',
    'creative_rejected',
    'campaign_activated',
    'campaign_expiring_soon',
    'campaign_completed',
    'campaign_rejected',
    'campaign_refunded',
    'creative_deadline_warning',
    'checkout_expired'
  ));

COMMENT ON CONSTRAINT campaign_notifications_notification_type_check
  ON public.campaign_notifications IS
  'Allowed notification types. checkout_expired added 2026-09-20 (WEB-ADS-011 AC4).';
