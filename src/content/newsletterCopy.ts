/**
 * What the weekly newsletter actually contains, in one place.
 *
 * Keep this in step with supabase/functions/assemble-weekly-digest/index.ts
 * (gatherContent): events in the next 7 days ordered featured-then-date, the
 * top-rated restaurants, and the newest published article. There is no AI step
 * and no trending metric in that pipeline, so the promise here names neither.
 */
export const NEWSLETTER_PROMISE =
  "One email a week: what's on in the next 7 days, a few top-rated places to eat, and our newest guide.";

/** Shown when the request failed and the function gave no reason of its own. */
export const NEWSLETTER_RETRY_MESSAGE =
  "We couldn't sign you up just now. Please try again in a moment.";

export const NEWSLETTER_SUBMIT_LABEL = "Subscribe Free";
export const NEWSLETTER_SUBMITTING_LABEL = "Subscribing...";

/*
 * What NewsletterSignup says after a successful submit (WEB-ADS-017). The row
 * is 'pending' until the emailed link is clicked, so this must not read as
 * done: it used to say "You're In! Welcome to the Des Moines Insider
 * community" while the toast from the same submit said "Almost there".
 *
 * It must also read the same for every outcome. newsletter-subscribe answers
 * one sentence for a new, pending, unsubscribed or already-active address and
 * mails nobody who is already active, so "we've sent you a link" would be
 * false for that reader and "you're already subscribed" would be an oracle.
 * Hence the conditional, which matches the function's GENERIC_ANSWER.
 */
export const NEWSLETTER_CONFIRM_HEADING = "Check your inbox";
export const NEWSLETTER_CONFIRM_BODY =
  "If that address can receive mail from us, a confirmation link is on its way. Click it to finish signing up; until then, no weekly email.";
