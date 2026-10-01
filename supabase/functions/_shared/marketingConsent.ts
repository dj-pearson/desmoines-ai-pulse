/**
 * May this user be sent marketing email? (WEB-LEGAL-012)
 *
 * profiles.lifecycle_signals.messagingAllowed is computed by the lifecycle
 * classifier from the newsletter unsubscribe status and the profile's
 * communication preferences. Every sender used to gate with
 * `messagingAllowed === false` or `!== false`, which reads a MISSING value as
 * consent. A value is missing for every user the classifier has not reached,
 * and the classifier is a cron job: while that job was failing (as the cron
 * health baseline shows it has been), every opted-out user was mailable by
 * every nurture agent the moment its own cron started working.
 *
 * Consent is something we record, not something we assume. Only an explicit
 * `true` allows a marketing send. Transactional mail (receipts, required
 * billing disclosures) does not come through here.
 */
export function hasMarketingConsent(lifecycleSignals: unknown): boolean {
  if (!lifecycleSignals || typeof lifecycleSignals !== "object") return false;
  return (lifecycleSignals as { messagingAllowed?: unknown }).messagingAllowed === true;
}
