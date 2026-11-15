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
 * equal to SITEMAP_ONLY_ROUTES plus NOT_SITEMAPPED_STATIC_PAGES and checks
 * each page reads its own entry.
 *
 * FOOTER POLICY PAGES (WEB-SEO-070). Six more pages are linked from the footer
 * on every page, so they are crawled, but they are not in the sitemap and not
 * prerendered: the same homepage shell, and they had no canonical or og tags
 * either. They get entries here so the page and the middleware share words.
 * They stay out of the sitemap on purpose: nobody searches for "Des Moines
 * Insider DMCA policy", the footer link already gets them crawled, and every
 * URL in sitemap-static.xml has to be either prerendered or declared in
 * SITEMAP_ONLY_ROUTES. Indexable, not submitted.
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
  // Footer-linked, not sitemapped (NOT_SITEMAPPED_STATIC_PAGES below).
  "/cookie-policy": {
    title: "Cookie Policy | Des Moines Insider",
    description:
      "How Des Moines Insider uses cookies and similar technologies, what categories exist, and how to change your preferences.",
    heading: "Cookie Policy",
  },
  "/dmca": {
    title: "DMCA / Copyright Policy | Des Moines Insider",
    description:
      "How to submit a DMCA takedown notice or counter-notice to Des Moines Insider, and how we handle copyright infringement claims.",
    heading: "DMCA / Copyright Policy",
  },
  "/acceptable-use": {
    title: "Acceptable Use Policy | Des Moines Insider",
    description:
      "Rules for using Des Moines Insider. What's prohibited, how we enforce these rules, and how to report abuse.",
    heading: "Acceptable Use Policy",
  },
  "/dpa": {
    title: "Data Processing Agreement | Des Moines Insider",
    description:
      "Des Moines Insider's standard Data Processing Agreement (DPA) for business customers with GDPR, CCPA, or similar data-protection obligations.",
    heading: "Data Processing Agreement",
  },
  "/affiliate-disclosure": {
    title: "Affiliate Disclosure | Des Moines Insider",
    description:
      "Des Moines Insider affiliate disclosure. How we earn commissions through hotel booking links, Ticketmaster ticket links and banner ads.",
    heading: "Affiliate Disclosure",
  },
  "/advertising-policies": {
    title: "Advertising Policies | Des Moines Insider",
    description:
      "What we require of ad creatives on Des Moines Insider: image sizes per placement, destination URL rules, content standards, and how review works.",
    heading: "Advertising Policies",
  },
} as const satisfies Record<string, StaticPageMeta>;

export type StaticPagePath = keyof typeof STATIC_PAGE_META;

/**
 * Entries that are deliberately NOT in sitemap-static.xml (WEB-SEO-070). Every
 * other key is a SITEMAP_ONLY_ROUTES path; the shell test holds the split.
 */
export const NOT_SITEMAPPED_STATIC_PAGES = [
  "/cookie-policy",
  "/dmca",
  "/acceptable-use",
  "/dpa",
  "/affiliate-disclosure",
  "/advertising-policies",
] as const satisfies readonly StaticPagePath[];

/** SEOHead's rule: append the site name unless the title already carries it. */
export function brandedTitle(title: string): string {
  return title.includes(BRAND.name) ? title : `${title} | ${BRAND.name}`;
}

export function staticPageMeta(pathname: string): StaticPageMeta | null {
  return Object.prototype.hasOwnProperty.call(STATIC_PAGE_META, pathname)
    ? STATIC_PAGE_META[pathname as StaticPagePath]
    : null;
}
