import { BRAND } from "@/lib/brandConfig";
import { NEIGHBORHOODS } from "@/lib/neighborhoods";

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
  "description": BRAND.description,
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
// Named HOME_PAGE_TITLE, not a second product tagline, and pointed only at
// [data-speakable]: the dated snapshot in GEOContent is the passage written to
// be read aloud and quoted (WP5 items 4 and 8). The snapshot mounts lazily and
// only after its query succeeds, so "h1" is listed too: the prerendered HTML
// must always contain at least one element the Speakable node points at.
export const HOME_SPEAKABLE = {
  name: HOME_PAGE_TITLE,
  description: BRAND.description,
  url: `${BRAND.baseUrl}/`,
  speakableCssSelectors: ["h1", "[data-speakable]"],
};

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
    answer: "Our today listing shows events confirmed for the current date in Central Time across Des Moines and the surrounding suburbs, filterable by category. It is rebuilt daily from event sources across the metro rather than depending on venues submitting their listings to us.",
    links: [{ label: "Events today", to: "/events/today" }],
  },
  {
    question: "Where are the best restaurants in Des Moines?",
    answer: "Des Moines dining spans fine dining, chef-driven small plates and long-standing local institutions. Well-known names include Harbinger, Alba in the East Village, 801 Chophouse and Proudfoot & Bird downtown, Splash Seafood Bar and Grill, and Latin King, where you can order Steak de Burgo, the dish most associated with the city. Our restaurant directory covers the metro with cuisine, price range, neighborhood and current open/closed status.",
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
    // Events only: the crawler is scheduled once a day
    // (.github/workflows/event-crawler.yml). No cadence is stated for
    // restaurants or attractions because no production schedule for them can
    // be named from this repo (WP5 item 2).
    answer: "Event listings are refreshed daily from venue and organiser sources. Event times are stored and displayed in Central Time to avoid the timezone drift common on aggregated calendars.",
  },
  {
    question: "Do you charge to be listed, and are any listings paid?",
    // Moved from GEOContent (WP5 item 3). WEB-SEO-042: this platform sells
    // sponsored placement, so the answer says so.
    answer: "Listing an event or a restaurant is free, and we do not charge to be included or to rank higher in the ordinary listings. We do sell advertising, including sponsored placements; those are paid, they are labelled where they appear, and they do not change the ordinary listings around them.",
  },
];
