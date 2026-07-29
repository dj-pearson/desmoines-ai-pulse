/**
 * Unit tests for the generic listing → detail-page discovery/extraction module.
 * Run with: `deno test --allow-none supabase/functions/_shared/eventPageDiscovery.test.ts`
 *
 * The fixtures below are stripped-down versions of the markup shapes the seeded
 * sources actually use: a WordPress "The Events Calendar" listing, a promoter
 * listing with /events/detail/<slug> links, a sports schedule with home and away
 * rows, and detail pages that publish their data via ld+json, microdata, or only
 * OpenGraph. No network access is required.
 */
import {
  applyHomeOnlyFilter,
  discoverDetailLinks,
  extractEventFromDetailHtml,
  extractHeroImage,
  findTicketUrl,
  isUsableLocation,
} from "./eventPageDiscovery.ts";
import { findEventSourceProfile } from "./eventSourceProfiles.ts";
import type { AdapterEvent } from "./domain-adapters/types.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

// ─── Link discovery ──────────────────────────────────────────────────────────

Deno.test("finds tribe /event/<slug>/ detail links and ignores calendar chrome", () => {
  const html = `<html><body>
    <nav><a href="/events/">Events</a><a href="/events/list/">List</a></nav>
    <div class="tribe-events-calendar-list">
      <a href="/event/an-evening-with-someone/" class="tribe-event-url">An Evening With</a>
      <a href="https://hoytsherman.org/event/comedy-night/">Comedy Night</a>
      <a href="/events/2026-09/">September</a>
      <a href="/events/category/music/">Music</a>
      <a href="/event/an-evening-with-someone/?utm_source=fb">dupe with tracking</a>
    </div>
    <footer><a href="/event/old-thing/">footer link still counts</a></footer>
  </body></html>`;

  const profile = findEventSourceProfile("https://hoytsherman.org/events/");
  const links = discoverDetailLinks(html, "https://hoytsherman.org/events/", profile);

  assert(
    links.some((l) => l.endsWith("/event/an-evening-with-someone/")),
    "relative detail link resolved",
  );
  assert(
    links.some((l) => l === "https://hoytsherman.org/event/comedy-night/"),
    "absolute same-host detail link kept",
  );
  assert(
    !links.some((l) => l.includes("/events/category/")),
    "category archive must be rejected",
  );
  assert(
    !links.some((l) => /\/events\/2026-09/.test(l)),
    "month view must be rejected",
  );
  assert(
    !links.some((l) => l.endsWith("/events/")),
    "the listing page itself must be rejected",
  );
  // utm-only variants collapse onto the canonical URL.
  const evening = links.filter((l) => l.includes("an-evening-with-someone"));
  assert(evening.length === 1, `utm dupe collapsed, got ${evening.length}`);
});

Deno.test("finds promoter /events/detail/<slug> links, skips off-host vendors", () => {
  const html = `<body>
    <a href="/events/detail/some-band-2026">Some Band</a>
    <a href="/events/detail/another-act">Another Act</a>
    <a href="https://www.ticketmaster.com/event/09005F123">Buy Tickets</a>
    <a href="https://www.instagram.com/woolysdm">Instagram</a>
    <a href="/first-fleet-venues/woolys">Venue info</a>
  </body>`;

  const profile = findEventSourceProfile("https://www.firstfleetconcerts.com/events");
  const links = discoverDetailLinks(html, "https://www.firstfleetconcerts.com/events", profile);

  assert(links.length === 2, `expected 2 detail links, got ${links.length}`);
  assert(
    links.every((l) => l.includes("/events/detail/")),
    "only detail links",
  );
  assert(
    !links.some((l) => l.includes("ticketmaster")),
    "off-host ticket vendor must not be crawled as a detail page",
  );
});

Deno.test("cross-host links are never followed even without a profile", () => {
  const html = `<body>
    <a href="/event/local-one">Local</a>
    <a href="https://evil.example.net/event/not-ours">Off-site</a>
  </body>`;
  const links = discoverDetailLinks(html, "https://venue.example.com/events/", null);
  assert(links.length === 1, `only the same-host link, got ${links.length}`);
  assert(links[0].includes("venue.example.com"), "same host");
});

Deno.test("assets and feed endpoints are never treated as detail pages", () => {
  const html = `<body>
    <a href="/event/real-one/">Real</a>
    <a href="/wp-json/tribe/events/v1/events">API</a>
    <a href="/event/thing.ics">Calendar file</a>
    <a href="/events/feed/">RSS</a>
    <a href="/event/poster.jpg">Poster image</a>
  </body>`;
  const links = discoverDetailLinks(html, "https://venue.example.com/events/", null);
  assert(links.length === 1, `expected 1, got ${links.length}: ${links.join(",")}`);
  assert(links[0].endsWith("/event/real-one/"), "only the real detail page");
});

Deno.test("discovery respects the caller's limit", () => {
  const html = `<body>${
    Array.from({ length: 40 }, (_, i) => `<a href="/event/e${i}/">E${i}</a>`).join("")
  }</body>`;
  const links = discoverDetailLinks(html, "https://venue.example.com/events/", null, 10);
  assert(links.length === 10, `expected 10, got ${links.length}`);
});

// ─── Image extraction ────────────────────────────────────────────────────────

Deno.test("og:image wins and is absolutized; logos and pixels are rejected", () => {
  const withOg = `<head>
    <meta property="og:image" content="/wp-content/uploads/2026/07/hero.jpg">
  </head><body><img src="/logo.png"></body>`;
  assert(
    extractHeroImage(withOg, "https://hoytsherman.org/event/x/") ===
      "https://hoytsherman.org/wp-content/uploads/2026/07/hero.jpg",
    "og:image resolved to absolute",
  );

  const onlyLogo = `<body><img class="site-logo" src="https://x.com/logo.svg"></body>`;
  assert(
    extractHeroImage(onlyLogo, "https://x.com/event/y") === null,
    "a logo must not be used as the event image",
  );

  const pixel = `<head><meta property="og:image" content="https://x.com/tracking-pixel.gif"></head>`;
  assert(
    extractHeroImage(pixel, "https://x.com/e") === null,
    "tracking pixel rejected",
  );
});

Deno.test("reversed meta attribute order and twitter:image both work", () => {
  const reversed =
    `<head><meta content="https://cdn.x.com/a.jpg" property="og:image"></head>`;
  assert(
    extractHeroImage(reversed, "https://x.com/e") === "https://cdn.x.com/a.jpg",
    "content-before-property order",
  );

  const twitter =
    `<head><meta name="twitter:image" content="https://cdn.x.com/b.jpg"></head>`;
  assert(
    extractHeroImage(twitter, "https://x.com/e") === "https://cdn.x.com/b.jpg",
    "twitter:image fallback",
  );
});

Deno.test("lazy-loaded hero img is found via data-src", () => {
  const lazy = `<body>
    <img class="event-hero" src="data:image/gif;base64,R0lGOD" data-src="https://cdn.x.com/hero.webp">
  </body>`;
  assert(
    extractHeroImage(lazy, "https://x.com/e") === "https://cdn.x.com/hero.webp",
    "data-src used instead of the base64 placeholder",
  );
});

// ─── Ticket URL selection ────────────────────────────────────────────────────

Deno.test("a vendor link behind a 'Buy Tickets' CTA is chosen as source_url", () => {
  const html = `<body>
    <a href="/about">About</a>
    <a href="https://www.etix.com/ticket/p/12345">Buy Tickets</a>
    <a href="https://facebook.com/event/1">Share</a>
  </body>`;
  assert(
    findTicketUrl(html, "https://hoytsherman.org/event/x/") ===
      "https://www.etix.com/ticket/p/12345",
    "etix CTA chosen",
  );
});

Deno.test("canonical URL is the fallback when no ticket link exists", () => {
  const html = `<head>
    <link rel="canonical" href="https://dmplayhouse.com/shows/anastasia/">
  </head><body><a href="/contact">Contact</a></body>`;
  assert(
    findTicketUrl(html, "https://dmplayhouse.com/shows/anastasia/?x=1") ===
      "https://dmplayhouse.com/shows/anastasia/",
    "canonical fallback",
  );
});

// ─── Location usability ──────────────────────────────────────────────────────

Deno.test("a location that is only the venue name is not usable", () => {
  // schema.org Place with a name and no address makes the JSON-LD extractor
  // return the name for BOTH venue and location, which silently drops the city.
  assert(
    !isUsableLocation("Horizon Events Center", "Horizon Events Center"),
    "venue-name copy rejected",
  );
  assert(
    !isUsableLocation("horizon events center", "Horizon Events Center"),
    "case-insensitive",
  );
  assert(!isUsableLocation("Des Moines, IA", "Some Venue"), "generic default rejected");
  assert(!isUsableLocation("Des Moines", "Some Venue"), "bare city default rejected");
  assert(!isUsableLocation("", "Some Venue"), "blank rejected");
  assert(!isUsableLocation(undefined, "Some Venue"), "undefined rejected");
});

Deno.test("a real address or a city/state pair is usable", () => {
  assert(
    isUsableLocation("2100 NW 100th St, Clive, IA 50325", "Horizon Events Center"),
    "street address",
  );
  assert(isUsableLocation("Clive, IA", "Horizon Events Center"), "city, state");
  assert(isUsableLocation("Waukee, IA", "Vibrant Music Hall"), "another city");
});

// ─── Detail-page extraction ──────────────────────────────────────────────────

Deno.test("ld+json detail page yields a complete event with a deep link", () => {
  const html = `<html><head>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"MusicEvent","name":"Jazz At The Place",
     "startDate":"2026-09-12T20:00:00-05:00",
     "location":{"@type":"Place","name":"Hoyt Sherman Place","address":{"streetAddress":"1501 Woodland Ave","addressLocality":"Des Moines","addressRegion":"IA"}},
     "image":"https://hoytsherman.org/img/jazz.jpg",
     "offers":{"@type":"Offer","price":"35","priceCurrency":"USD"}}
    </script></head><body>
    <a href="https://www.etix.com/ticket/p/999">Buy Tickets</a>
  </body></html>`;

  const ev = extractEventFromDetailHtml(html, "https://hoytsherman.org/event/jazz/", {
    venue: "Hoyt Sherman Place",
    location: "1501 Woodland Ave, Des Moines, IA 50309",
    category: "Music",
  });

  assert(ev !== null, "event extracted");
  assert(ev!.title === "Jazz At The Place", "title");
  assert(ev!.date === "2026-09-12 20:00:00", `local wall clock kept, got ${ev!.date}`);
  assert(ev!.venue === "Hoyt Sherman Place", "venue");
  assert(ev!.category === "Music", `category, got ${ev!.category}`);
  assert(ev!.price === "$35", `price, got ${ev!.price}`);
  assert(ev!.image_url === "https://hoytsherman.org/img/jazz.jpg", "image");
  assert(
    (ev!.source_url ?? "") !== "https://hoytsherman.org/events/",
    "source_url must never be the listing page",
  );
});

Deno.test("OpenGraph-only detail page still produces an event", () => {
  const html = `<html><head>
    <title>Elf The Musical | Des Moines Playhouse</title>
    <meta property="og:title" content="Elf The Musical">
    <meta property="og:description" content="A holiday favorite on the mainstage.">
    <meta property="og:image" content="https://dmplayhouse.com/img/elf.jpg">
    <meta itemprop="startDate" content="2026-12-05T19:30:00-06:00">
  </head><body><h1>Elf The Musical</h1></body></html>`;

  const ev = extractEventFromDetailHtml(html, "https://dmplayhouse.com/shows/elf/", {
    venue: "Des Moines Community Playhouse",
    location: "831 42nd St, Des Moines, IA 50312",
    category: "Arts",
  });

  assert(ev !== null, "event extracted from meta only");
  assert(ev!.title === "Elf The Musical", `title, got ${ev!.title}`);
  assert(ev!.date === "2026-12-05 19:30:00", `date, got ${ev!.date}`);
  assert(ev!.venue === "Des Moines Community Playhouse", "profile venue default applied");
  assert(ev!.location.includes("831 42nd St"), "profile address default applied");
  assert(ev!.image_url === "https://dmplayhouse.com/img/elf.jpg", "og:image");
  assert(ev!.source_url === "https://dmplayhouse.com/shows/elf/", "self URL as deep link");
});

Deno.test("<time datetime> is the last-resort date source", () => {
  const html = `<body><h1>Symphony Season Opener</h1>
    <time datetime="2026-10-03T19:30">Oct 3</time></body>`;
  const ev = extractEventFromDetailHtml(html, "https://www.dmsymphony.org/event/opener/");
  assert(ev !== null, "extracted");
  assert(ev!.date === "2026-10-03 19:30:00", `date, got ${ev!.date}`);
});

Deno.test("a page with no recoverable date is dropped, not guessed", () => {
  const html = `<body><h1>Some Page</h1><p>No dates here.</p></body>`;
  assert(
    extractEventFromDetailHtml(html, "https://x.com/event/y") === null,
    "no date → no event (a guessed date is worse than no row)",
  );
});

Deno.test("published venue is never overwritten by the profile default", () => {
  // First Fleet books several venues; stamping every show as Wooly's would be wrong.
  const html = `<head><script type="application/ld+json">
    {"@type":"MusicEvent","name":"Band At xBk","startDate":"2026-08-02T20:00:00",
     "location":{"@type":"Place","name":"xBk Live"}}
  </script></head>`;
  const ev = extractEventFromDetailHtml(
    html,
    "https://www.firstfleetconcerts.com/events/detail/band",
    { venue: "Wooly's", location: "504 E Locust St, Des Moines, IA 50309" },
  );
  assert(ev!.venue === "xBk Live", `published venue kept, got ${ev!.venue}`);
});

// ─── Home-only sports filtering ──────────────────────────────────────────────

function ev(partial: Partial<AdapterEvent>): AdapterEvent {
  return {
    title: "Game",
    description: "",
    date: "2026-11-14 19:00:00",
    location: "Des Moines, IA",
    venue: "Wells Fargo Arena",
    category: "Sports",
    ...partial,
  };
}

Deno.test("away games and out-of-season rows are dropped; titles normalized", () => {
  const wild = findEventSourceProfile("https://www.iowawild.com/games")!.homeOnly!;
  const filtered = applyHomeOnlyFilter(
    [
      ev({ title: "Iowa Wild vs Texas Stars", date: "2026-11-14 19:00:00" }),
      ev({ title: "Iowa Wild @ Milwaukee Admirals", date: "2026-11-21 19:00:00" }),
      ev({ title: "Iowa Wild at Rockford IceHogs", date: "2026-12-02 19:00:00" }),
      ev({ title: "Texas Stars", date: "2026-12-09 19:00:00" }),
      ev({ title: "Iowa Wild vs Somebody", date: "2026-07-04 19:00:00" }),
    ],
    wild,
  );

  const titles = filtered.map((e) => e.title);
  assert(filtered.length === 2, `expected 2 home in-season, got ${filtered.length}: ${titles}`);
  assert(titles.includes("Iowa Wild vs Texas Stars"), "home game kept");
  assert(
    titles.includes("Iowa Wild vs Texas Stars"),
    "bare-opponent row prefixed with the team name",
  );
  assert(
    !titles.some((t) => t.includes("@") || / at /.test(t)),
    "no away games survive",
  );
  assert(
    !filtered.some((e) => e.date.startsWith("2026-07")),
    "a July hockey game is off-season noise and must be dropped",
  );
});

Deno.test("home-only filtering leaves an already-correct title untouched", () => {
  const wolves = findEventSourceProfile("https://iowa.gleague.nba.com/schedule")!.homeOnly!;
  const [only] = applyHomeOnlyFilter(
    [ev({ title: "Iowa Wolves vs Sioux Falls Skyforce", date: "2027-01-15 19:00:00" })],
    wolves,
  );
  assert(only.title === "Iowa Wolves vs Sioux Falls Skyforce", "unchanged");
});
