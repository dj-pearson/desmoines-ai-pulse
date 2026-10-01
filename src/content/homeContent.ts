import { BRAND } from "@/lib/brandConfig";
import { NEIGHBORHOODS } from "@/lib/neighborhoods";
import { EVENTS_UPDATE_ANSWER } from "@/content/eventsCopy";

// Home page content, extracted from src/pages/Index.tsx (WP0 of
// docs/page-plans/home.md) so the page file is composition only. WP5 owns
// what these say; Index only imports them.

export interface HomeFaqItem {
  question: string;
  answer: string;
  /** Internal hubs the answer describes; FAQSection renders them as links. */
  links?: { label: string; to: string }[];
}

/**
 * The page title, shared by SEOHead and the Speakable WebPage node so the two
 * name the same page (WP5 item 8).
 */
export const HOME_PAGE_TITLE = "Des Moines Insider | Events, Restaurants & Things to Do";

/**
 * The meta description, and the WebPage node's description (home pass-2 WP4
 * item 4). Moved here from Index.tsx so SEOHead and the Speakable node carry
 * one string.
 */
export const HOME_META_DESCRIPTION =
  "What's on in Des Moines, Iowa right now: live events and festivals, restaurants open tonight, and family plans for the weekend. Updated daily across the metro.";

/**
 * What the WebSite node says the site is. Each clause is something the code
 * does: the four catalogues, the daily event crawl
 * (.github/workflows/event-crawler.yml) and Central-time display. It replaced
 * BRAND.description, which promised live updates and tailored suggestions
 * the site does not make (home pass-2 WP4 item 4).
 */
export const HOME_SITE_DESCRIPTION =
  "Events, restaurants, attractions and playgrounds across the Des Moines metro; event listings refreshed daily, times in Central.";

const ORGANIZATION_ID = `${BRAND.baseUrl}/#organization`;
const WEBSITE_ID = `${BRAND.baseUrl}/#website`;

export const HOME_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  // One graph (WP5 item 8): SpeakableSchema's isPartOf points at this @id,
  // and the publisher is a reference to the Organization node SEOHead emits
  // on every page rather than a second inline copy of it.
  "@id": WEBSITE_ID,
  "name": BRAND.name,
  "alternateName": BRAND.shortName,
  "url": BRAND.baseUrl,
  "description": HOME_SITE_DESCRIPTION,
  // NO applicationCategory. It said "City Guide, AI Assistant, Event
  // Discovery" and was wrong twice over: it is a property of
  // SoftwareApplication, not WebSite, so it is invalid on this node and
  // contributes nothing - and it told crawlers this site is an AI assistant.
  // Ask Pulse ships on iOS and Android and has never been built for web
  // (XPLAT-009). Structured data is the one place a claim is machine-read.
  // NO keywords. They claimed "predictive analytics" and "behavioral
  // intelligence", which nothing in the product does (WP5 item 8).
  "publisher": { "@id": ORGANIZATION_ID },
  "potentialAction": [
    {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        // WEB-SEO-029: was /events?search=, which nothing reads. EventsPage
        // takes 'q' and /search is the page built for a free-text query
        // (SearchResults.tsx reads ?q=), so a granted sitelinks search box
        // used to drop the visitor on an unfiltered events list.
        "urlTemplate": `${BRAND.baseUrl}/search?q={search_term_string}`,
        // Web platforms only: this target is a web URL, and the iOS and
        // Android apps do not open it (WP5 item 8).
        "actionPlatform": [
          "http://schema.org/DesktopWebPlatform",
          "http://schema.org/MobileWebPlatform"
        ]
      },
      "query-input": "required name=search_term_string"
    }
    // WEB-SEO-026: TWO MORE InteractActions USED TO SIT HERE - an "SMS
    // Concierge" and a "Voice Assistant" described as "Alexa and Google
    // Assistant integration". Neither exists. There is no number to text and
    // no skill to invoke, and XPLAT-009 records that the assistant is missing
    // from the web app entirely. potentialAction is a promise about what a
    // machine can DO with this site; the SearchAction above is the only one
    // the site can keep.
  ],
  // WEB-SEO-023: this asserted Facebook, X and Instagram profiles on the
  // OLD brand's handle, under the new brand's name. sameAs is a
  // machine-readable identity claim, so the property is OMITTED rather
  // than emitted empty until BRAND.social has real URLs in it.
  ...(BRAND.social.length > 0 ? { sameAs: [...BRAND.social] } : {}),
};

// WEB-SEO-026: A LocalBusiness NODE USED TO BE BUILT alongside this and shipped
// on the home page. An aggregator is not a local business, and this one said
// so itself: telephone "", streetAddress "", a postalCode of 50309 that belongs
// to downtown Des Moines rather than to us, and openingHours of 00:00-23:59
// seven days a week. Every one of those is a fact a machine can act on, and
// none of them was true.
//
// WHAT REPLACES IT IS NOTHING, deliberately. The site's identity is the
// Organization node SEOHead emits on every page, with a stable @id; the
// WebSite node above belongs to / alone. A second, contradictory identity
// claim in a different type is not extra coverage - it is ambiguity, and
// Google resolves ambiguity by using neither.
//
// WEB-SEO-016 had already removed an aggregateRating of 4.8 from 1,247
// reviews from this same object. Nothing produced those numbers either.

// Speakable Schema for GEO - enables AI search engine attribution.
// Named HOME_PAGE_TITLE, described with HOME_META_DESCRIPTION, and pointed only
// at [data-speakable]: the dated snapshot in GEOContent is the passage written
// to be read aloud and quoted. The heading used to be listed as well, because
// the snapshot sat in a LazySection the prerender never mounted; the
// prerender now mounts every section (home pass-2 WP1 item 1), so the
// snapshot is in the HTML whenever its query succeeds (WP4 item 5).
export const HOME_SPEAKABLE = {
  name: HOME_PAGE_TITLE,
  description: HOME_META_DESCRIPTION,
  url: `${BRAND.baseUrl}/`,
  speakableCssSelectors: ["[data-speakable]"],
};

/**
 * What the home page is about, for the WebPage node (WP4 item 6). The Speakable
 * component builds that node; this is exported for it to spread in.
 */
export const HOME_ABOUT = {
  "@type": "City",
  name: "Des Moines",
  containedInPlace: { "@type": "State", name: "Iowa" },
} as const;

/**
 * What money buys, said once. Read against src/lib/sponsored.ts
 * (SPONSORED_CAP = 2, isSponsoredActive) and src/lib/placementSpecs.ts (the
 * banner and sponsored-listing products /advertise sells).
 */
export const HOME_PAID_PLACEMENT_ANSWER =
  "Listing an event or a restaurant is free. We sell two things: banner ad slots, and sponsored listings. A sponsored listing can appear first on the events, restaurants and attractions pages, at most two per list, and each one carries a Sponsored label. Nothing else is reordered for money.";

export const HOME_FAQ_TITLE = "Des Moines: Frequently Asked Questions";
export const HOME_FAQ_DESCRIPTION =
  "Quick answers about events, dining, and things to do across the Des Moines metro.";

// WEB-SEO-012: these questions used to be about our own product - "What makes
// Des Moines Insider different from other event directories?", "How does
// behavioral learning improve my experience?". Eight of eleven described the
// software rather than the city, on the page with the most authority to
// spend. They now answer what visitors actually search for. Substantive
// answers matter more than the markup here: Google retired FAQ rich results
// for non-gov/health sites in 2023, so the value of this block is on-page
// relevance plus extraction by AI assistants, and both reward real answers
// over restated marketing.
/** "A, B and C" */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The areas with a guide page, from the one inventory. This answer used to
 * name Beaverdale, Highland Park, the Court Avenue District and five others
 * that have no page (WP5 item 2); built from NEIGHBORHOODS it cannot drift.
 */
const COVERED_AREAS = joinNames(NEIGHBORHOODS.map((n) => n.name));

// Owner: home page content, docs/page-plans/home.md WP5. Venue facts last
// reviewed 2026-09-24. Re-check the named venues, the skatepark figure and the
// State Fair length when this is next edited; a wrong fact here is quoted by
// assistants with our name on it.
export const HOME_FAQS: HomeFaqItem[] = [
  {
    question: "What is there to do in Des Moines this weekend?",
    answer: "Des Moines has live events every weekend across music, food, arts, sports and family activities. The Downtown Farmers' Market runs Saturday mornings May through October in the Historic Court District, touring Broadway shows play the Des Moines Civic Center, concerts run at Wells Fargo Arena and smaller venues like xBk Live, and the East Village and Historic Valley Junction host regular gallery and shopping events. See our full this-weekend listing for what is confirmed for the coming Saturday and Sunday, updated daily.",
    links: [{ label: "Events this weekend", to: "/events/this-weekend" }],
  },
  {
    question: "What free things are there to do in Des Moines?",
    answer: "Several of the best-known attractions in Des Moines are free year-round: the Des Moines Art Center, the John and Mary Pappajohn Sculpture Park, the State Historical Museum of Iowa in the East Village, the Iowa State Capitol grounds, and Lauridsen Skatepark, which at 88,000 square feet was billed as the largest skatepark in the United States when it opened in 2021. Free splash pads open across the metro in summer, and Saylorville Lake and the Neal Smith Trail are open for hiking and biking at no cost.",
    links: [{ label: "Free events", to: "/events/free" }],
  },
  {
    question: "What events are happening in Des Moines today?",
    answer: "Our today listing shows events confirmed for the current date in Central Time across Des Moines and the surrounding suburbs, grouped by time of day: what is on now, this afternoon and tonight. It is rebuilt daily from event sources across the metro rather than depending on venues submitting their listings to us.",
    links: [{ label: "Events today", to: "/events/today" }],
  },
  {
    question: "Where are the best restaurants in Des Moines?",
    answer: "Des Moines dining spans fine dining, chef-driven small plates and long-standing local institutions. Well-known names include Harbinger, Alba in the East Village, 801 Chophouse and Proudfoot & Bird downtown, Splash Seafood Bar and Grill, and Latin King, where you can order Steak de Burgo, the dish most associated with the city. Our restaurant directory covers the metro with cuisine, price range, city and current open/closed status, and the neighborhood guides group places area by area.",
    links: [{ label: "Neighborhood guides", to: "/neighborhoods" }],
  },
  {
    question: "What restaurants in Des Moines are open right now?",
    // No clock times here: late-night hours change more often than this file
    // does, and the open-now listing checks them live.
    answer: "Our open-now listing checks current hours against the time in Central Time and shows only what is serving at this moment, including late at night. Hours can lag behind the venue, so each listing links to the restaurant's own page; if the two disagree, believe the venue.",
    links: [{ label: "Restaurants open now", to: "/restaurants/open-now" }],
  },
  {
    question: "What is there to do in Des Moines with kids?",
    answer: "The metro has strong family options, many of them free. Blank Park Zoo, the Science Center of Iowa and Adventureland in Altoona are the main paid attractions; the Des Moines Art Center, the State Historical Museum and the Pappajohn Sculpture Park are free and work well with children. We also map playgrounds across the metro with age suitability and accessibility details, and maintain a kids and family events listing.",
    links: [
      { label: "Playgrounds", to: "/playgrounds" },
      { label: "Kids and family events", to: "/events/kids" },
    ],
  },
  {
    question: "Which areas does Des Moines Insider cover?",
    answer: `Des Moines and the suburbs around it: events and restaurants are listed across the metro. These areas have their own guide page: ${COVERED_AREAS}.`,
    links: [{ label: "Neighborhood guides", to: "/neighborhoods" }],
  },
  {
    question: "When is the Iowa State Fair?",
    answer: "The Iowa State Fair runs for 11 days each August at the Iowa State Fairgrounds on the east side of Des Moines. It is the largest single event in the state and draws over a million visitors. Our Iowa State Fair guide covers dates, the grandstand concert lineup, parking, admission and food.",
    links: [{ label: "Iowa State Fair guide", to: "/iowa-state-fair" }],
  },
  {
    question: "How often are the listings updated?",
    // Events only, and the same sentence every events page uses
    // (src/content/eventsCopy.ts), so the cadence is stated in one place. No
    // cadence is stated for restaurants or attractions because no production
    // schedule for them can be named from this repo.
    answer: EVENTS_UPDATE_ANSWER,
  },
  {
    question: "Do you charge to be listed, and are any listings paid?",
    // WEB-SEO-042 and home pass-2 WP4 item 1. The old answer said sponsored
    // placements left the ordinary listings alone, while arrangeSponsored
    // (src/lib/sponsored.ts) moves up to SPONSORED_CAP paid rows to the top
    // of the events, restaurants and attractions lists. This says what the
    // code does. HOME_PAID_PLACEMENT_ANSWER is shared with GEOContent.
    answer: HOME_PAID_PLACEMENT_ANSWER,
    links: [{ label: "Advertising options", to: "/advertise" }],
  },
];
