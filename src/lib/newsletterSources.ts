/**
 * Where a newsletter signup came from, stored as newsletter_subscribers.source
 * and shown in the Source column of /admin's subscriber list (WEB-ADS-033).
 *
 * Every on-site form except the footer used to send 'website', so the column
 * could say "footer" or "somewhere else" and nothing finer: nobody could tell
 * whether the end-of-article form, the visitors guide or the confirm page's
 * retry form ever signed anyone up. Each form now names itself.
 *
 * newsletter-subscribe keeps its own copy of this list (ALLOWED_SOURCES, Deno
 * cannot import from src/) and stores 'website' for anything it does not know,
 * so a value added here and not there is silently flattened. A vitest compares
 * the two lists. Adding a value is safe in one release; removing or renaming
 * one would make older rows unreadable as the same form, so don't.
 */
export const NEWSLETTER_SOURCES = [
  "website",
  "popup",
  "footer",
  "checkout",
  "hero",
  "article",
  "visitors_guide",
  "confirm_page",
  "reminder_notice",
] as const;

export type NewsletterSource = (typeof NEWSLETTER_SOURCES)[number];
