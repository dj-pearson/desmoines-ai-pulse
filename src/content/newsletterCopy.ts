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
