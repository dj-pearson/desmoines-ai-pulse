/**
 * Title, description and heading for the sitemapped routes that skip the
 * prerender (WEB-SEO-069).
 *
 * scripts/prerender-routes.mjs lists six routes in SITEMAP_ONLY_ROUTES: we
 * submit them, but they are not rendered to static HTML. A request for one is
 * answered with the SPA fallback, which is the prerendered HOMEPAGE, and
 * functions/_middleware.ts only fixed its canonical and dropped its JSON-LD.
 * So every crawler that does not run JavaScript (GPTBot, ClaudeBot,
 * PerplexityBot, the link-preview bots) read /privacy-policy as "Des Moines
 * Insider | Events, Restaurants & Things to Do" with the homepage's
 * description, og:title and H1: six submitted URLs with one duplicate title.
 *
 * ONE COPY OF THE WORDS. The pages pass these to SEOHead and the middleware
 * writes the same ones into the shell, so the two cannot drift. Relative
 * imports only: Pages Functions bundles this file and does not read "@/".
 * functions/__tests__/middleware-static-page-shell.test.mjs holds the keys
 * equal to SITEMAP_ONLY_ROUTES and checks each page reads its own entry.
 */
import { BRAND } from "./brandConfig";

export interface StaticPageMeta {
  /** As passed to SEOHead; brandedTitle adds the site name when it is absent. */
  title: string;
  description: string;
  /** The page's visible H1, so the shell's body names the same page. */
  heading: string;
}

export const STATIC_PAGE_META = {
  "/advertise": {
    title: "Advertise on Des Moines Insider",
    description:
      "Buy a banner or a sponsored listing on Des Moines Insider's event, restaurant and attraction pages. Pick your dates, see the exact total, pay by card.",
    heading: "Advertise on Des Moines Insider",
  },
  "/business-partnership": {
    title: "For Des Moines Businesses",
    description:
      "Claim your Des Moines restaurant or attraction listing, correct its details, submit events and buy ad placements with impression and click reporting.",
    heading: "Your business on Des Moines Insider",
  },
  "/submit-event": {
    title: "Submit an Event",
    description:
      "Add your Des Moines event to the Des Moines Insider calendar. Sign in, fill in the details and follow its status from your dashboard.",
    heading: "Submit an event",
  },
  "/whats-new": {
    title: "What's New in Des Moines",
    description:
      "Restaurant openings, closings and other changes on the Des Moines scene, newest first, with the date each was posted in Central time.",
    heading: "What's New in Des Moines",
  },
  "/privacy-policy": {
    title: "Privacy Policy | Des Moines Insider",
    description:
      "How Des Moines Insider collects, uses and protects your personal information, and your rights under GDPR, CCPA/CPRA and US state privacy laws.",
    heading: "Privacy Policy",
  },
  "/terms": {
    title: "Terms of Service | Des Moines Insider",
    description:
      "Read the Terms of Service for Des Moines Insider. Understand your rights and responsibilities when using our AI-powered city guide platform.",
    heading: "Terms of Service",
  },
} as const satisfies Record<string, StaticPageMeta>;

export type StaticPagePath = keyof typeof STATIC_PAGE_META;

/** SEOHead's rule: append the site name unless the title already carries it. */
export function brandedTitle(title: string): string {
  return title.includes(BRAND.name) ? title : `${title} | ${BRAND.name}`;
}

export function staticPageMeta(pathname: string): StaticPageMeta | null {
  return Object.prototype.hasOwnProperty.call(STATIC_PAGE_META, pathname)
    ? STATIC_PAGE_META[pathname as StaticPagePath]
    : null;
}
