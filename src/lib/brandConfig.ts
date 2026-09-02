/**
 * Centralized Brand Configuration
 *
 * This file contains all brand-related constants used throughout the application.
 * Update these values when branding changes to ensure consistency across all SEO,
 * meta tags, sitemaps, and user-facing content.
 */

export const BRAND = {
  // Primary brand name - used in titles, meta tags, and content
  name: 'Des Moines Insider',

  // Short name - used where space is limited
  shortName: 'DM Insider',

  // Production URL - used for canonical URLs, sitemaps, and structured data
  // Update this when deploying to a new domain
  baseUrl: 'https://desmoinesinsider.com',

  // Social media handle. WEB-SEO-023: this read '@desmoinessider', which is the
  // brand name with the "in" missing -- a typo, not a handle. Corrected to match
  // the domain. OWNER: confirm this handle actually exists on X; a twitter:site
  // pointing at nothing renders the card fine, which is why a typo here can sit
  // for a year without anyone noticing.
  twitter: '@desmoinesinsider',

  /**
   * Profiles this brand actually has, used for schema.org `sameAs` and for the
   * footer's social links, which must agree (WEB-SEO-023).
   *
   * EMPTY ON PURPOSE, and the emptiness is the fix. Five components asserted
   * sameAs pointing at Facebook, X and Instagram profiles under the OLD brand's
   * handle, carried on the new brand's name -- and the footer linked to the
   * three networks' homepages, which are sites, not profiles. `sameAs` is a machine-readable identity claim: "this organisation
   * IS that account". Claiming an account the brand does not own is worse than
   * claiming none, because a crawler reconciling entities will believe it.
   *
   * OWNER: add the real profile URLs here and both the JSON-LD and the footer
   * pick them up. Until then, consumers omit `sameAs` entirely rather than
   * emitting an empty array, which schema.org treats as a claim of no profiles.
   */
  social: [] as readonly string[],

  // Geographic targeting
  city: 'Des Moines',
  state: 'Iowa',
  stateAbbr: 'IA',
  region: 'Greater Des Moines Area',
  country: 'US',

  // Default descriptions
  tagline: 'Your AI-powered guide to Des Moines events, restaurants, and local discoveries',
  description: 'Discover events, restaurants, and attractions in Des Moines, Iowa. AI-powered local guide with real-time updates, personalized recommendations, and comprehensive coverage of the Greater Des Moines area.',

  // Default images
  logo: '/DMI-Logo.png',
  // /og-image.png DOES NOT EXIST, and the way it fails is the problem: Cloudflare
  // serves the SPA shell for it, so a social crawler gets 200 text/html where an
  // image should be. No error anywhere, and the link preview simply has no image.
  // Six prerendered pages fell back to it - /articles, /contact, /iowa-state-fair,
  // /restaurants, /things-to-do, /trip-planner - while the other 37 pass an
  // explicit DMI-Logo.png. This makes the default the file those 37 already use.
  //
  // DMI-Logo.png is 800x800. A purpose-built 1200x630 card would preview better
  // on every network; that is a design task, not a broken-link fix, so it is not
  // done here. An existing square image beats a 200 of HTML.
  ogImage: '/DMI-Logo.png',

  // Theme colors
  themeColor: '#3B82F6',
  backgroundColor: '#ffffff',

  // Contact
  email: 'hello@desmoinesinsider.com',
} as const;

// Helper functions for common SEO patterns
/**
 * Absolute URL for a site path. Idempotent: passing a URL that is already
 * absolute returns it unchanged.
 *
 * WEB-SEO-002: it used to unconditionally prepend BRAND.baseUrl, so an absolute
 * input produced `https://desmoinesinsider.com/https://desmoinesinsider.com/things-to-do`.
 * At least five call sites do exactly that — SEOHead re-derives og:url through
 * this helper from a `url` prop that pages already build with getCanonicalUrl
 * or `${BRAND.baseUrl}/...` (ThingsToDoHub, Index, EventsPage, ArticleDetails,
 * RestaurantDetails). The canonical link was unaffected because it uses the
 * canonicalUrl prop directly, which is why this survived: only og:url was
 * mangled, and nothing renders og:url visibly.
 *
 * Guarding here rather than at each call site fixes every current and future
 * caller, and passing an absolute URL is a reasonable thing to expect to work.
 */
export function getCanonicalUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BRAND.baseUrl}${cleanPath}`;
}

export function getPageTitle(title: string, includeBrand = true): string {
  if (!includeBrand) return title;
  return `${title} | ${BRAND.name}`;
}

export function getLocalizedLocation(neighborhood?: string): string {
  if (neighborhood) {
    return `${neighborhood}, ${BRAND.city}, ${BRAND.state}`;
  }
  return `${BRAND.city}, ${BRAND.state}`;
}

// Export individual constants for backward compatibility
export const SITE_NAME = BRAND.name;
export const BASE_URL = BRAND.baseUrl;
export const CITY = BRAND.city;
export const STATE = BRAND.state;
export const REGION = BRAND.region;
