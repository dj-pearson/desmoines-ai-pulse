/**
 * Unit tests for the profile-driven venue adapter (listing → detail-page walk).
 * Run with: `deno test --allow-none supabase/functions/_shared/domain-adapters/venueProfile.test.ts`
 *
 * `globalThis.fetch` is stubbed with small fixture sites, so no network access is
 * needed. The scenarios mirror the real failure modes found in the audit:
 *
 *   - a listing page that only LINKS to its events (the case that produced rows
 *     all sharing the listing URL, with no image)
 *   - a listing page that carries complete ld+json (single request is enough)
 *   - a seeded URL that sits one layer ABOVE the calendar (Wooly's)
 *   - a sports schedule mixing home and away rows
 *   - a client-rendered page that yields nothing, which must fall through
 */
import { venueProfileAdapter } from "./venueProfile.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

/** Serve a fixture map keyed by URL; anything unmapped 404s. */
async function withSite<T>(
  pages: Record<string, string>,
  run: () => Promise<T>,
): Promise<{ result: T; requested: string[] }> {
  const original = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = (typeof input === "string" ? input : input.toString()).replace(
      /\/$/,
      "",
    );
    requested.push(url);
    const body = pages[url] ?? pages[`${url}/`];
    if (body === undefined) {
      return Promise.resolve(new Response("not found", { status: 404 }));
    }
    return Promise.resolve(
      new Response(body, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    // deno-lint-ignore no-explicit-any
  }) as any;
  try {
    return { result: await run(), requested };
  } finally {
    globalThis.fetch = original;
  }
}

function ldJson(obj: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

function detailPage(
  name: string,
  startDate: string,
  venue: string,
  image: string,
  ticketHref?: string,
): string {
  return `<html><head>${
    ldJson({
      "@context": "https://schema.org",
      "@type": "MusicEvent",
      name,
      startDate,
      location: { "@type": "Place", name: venue },
      image,
    })
  }</head><body>${
    ticketHref ? `<a href="${ticketHref}">Buy Tickets</a>` : ""
  }</body></html>`;
}

Deno.test("walks a link-only listing into per-event detail pages", async () => {
  const listing = `<html><body><div class="events">
    <a href="/event/band-one/">Band One</a>
    <a href="/event/band-two/">Band Two</a>
    <a href="/event/band-three/">Band Three</a>
    <a href="/event/band-four/">Band Four</a>
    <a href="/events/category/music/">Music</a>
  </div></body></html>`;

  const { result } = await withSite(
    {
      "https://horizoneventscenter.com/upcoming-events": listing,
      "https://www.horizoneventscenter.com/upcoming-events": listing,
      "https://www.horizoneventscenter.com/event/band-one": detailPage(
        "Band One",
        "2026-09-01T20:00:00-05:00",
        "Horizon Events Center",
        "https://cdn.x.com/one.jpg",
        "https://www.etix.com/ticket/p/1",
      ),
      "https://www.horizoneventscenter.com/event/band-two": detailPage(
        "Band Two",
        "2026-09-08T20:00:00-05:00",
        "Horizon Events Center",
        "https://cdn.x.com/two.jpg",
      ),
      "https://www.horizoneventscenter.com/event/band-three": detailPage(
        "Band Three",
        "2026-09-15T19:30:00-05:00",
        "Horizon Events Center",
        "https://cdn.x.com/three.jpg",
      ),
      "https://www.horizoneventscenter.com/event/band-four": detailPage(
        "Band Four",
        "2026-09-22T19:30:00-05:00",
        "Horizon Events Center",
        "https://cdn.x.com/four.jpg",
      ),
    },
    () =>
      venueProfileAdapter.fetch(
        "https://www.horizoneventscenter.com/upcoming-events/",
        "events",
      ),
  );

  assert(result.success, `success, error: ${result.error}`);
  assert(result.items.length === 4, `4 events, got ${result.items.length}`);

  // The whole point: each row deep-links to its own event, and each has an image.
  const urls = new Set(result.items.map((i) => i.source_url));
  assert(urls.size === 4, `4 distinct source_urls, got ${urls.size}`);
  assert(
    !result.items.some((i) => (i.source_url ?? "").includes("upcoming-events")),
    "no row may point back at the listing page",
  );
  assert(
    result.items.every((i) => i.image_url !== null),
    "every row has an image",
  );

  // Clive, not Des Moines — the generic path used to default this wrong.
  assert(
    result.items.every((i) => i.location.includes("Clive")),
    `profile location applied, got ${result.items[0].location}`,
  );

  // The one event with a vendor CTA prefers that link.
  const one = result.items.find((i) => i.title === "Band One")!;
  assert(
    one.source_url === "https://www.etix.com/ticket/p/1",
    `etix CTA preferred, got ${one.source_url}`,
  );
});

Deno.test("a listing rich in ld+json needs no detail crawl", async () => {
  const events = [1, 2, 3, 4, 5].map((n) => ({
    "@context": "https://schema.org",
    "@type": "TheaterEvent",
    name: `Show ${n}`,
    startDate: `2026-10-0${n}T19:30:00-05:00`,
    location: { "@type": "Place", name: "Des Moines Community Playhouse" },
    image: `https://dmplayhouse.com/img/${n}.jpg`,
    url: `https://dmplayhouse.com/shows/show-${n}/`,
  }));

  const listing = `<html><head>${ldJson(events)}</head><body>
    <a href="/shows/show-1/">Show 1</a>
  </body></html>`;

  const { result, requested } = await withSite(
    { "https://dmplayhouse.com/shows": listing },
    () => venueProfileAdapter.fetch("https://dmplayhouse.com/", "events"),
  );

  assert(result.success, `success, error: ${result.error}`);
  assert(result.items.length === 5, `5 events, got ${result.items.length}`);
  assert(
    requested.length === 1,
    `single request when the listing is complete, made ${requested.length}`,
  );
  assert(
    result.items.every((i) => (i.source_url ?? "").includes("/shows/show-")),
    "per-event URLs from ld+json",
  );
});

Deno.test("a seeded URL above the calendar still reaches the calendar", async () => {
  // Wooly's seeded URL is /first-fleet-venues/woolys — a venue profile page.
  // The canonical /events listing must be tried FIRST.
  const listing = `<body>
    <a href="/events/detail/act-one">Act One</a>
    <a href="/events/detail/act-two">Act Two</a>
    <a href="/events/detail/act-three">Act Three</a>
    <a href="/events/detail/act-four">Act Four</a>
  </body>`;

  const detail = (slug: string, name: string, venue: string) =>
    detailPage(name, "2026-08-14T20:00:00-05:00", venue, `https://cdn.x.com/${slug}.jpg`);

  const { result, requested } = await withSite(
    {
      "https://www.firstfleetconcerts.com/events": listing,
      "https://www.firstfleetconcerts.com/events/detail/act-one": detail(
        "one",
        "Act One",
        "Wooly's",
      ),
      "https://www.firstfleetconcerts.com/events/detail/act-two": detail(
        "two",
        "Act Two",
        "xBk Live",
      ),
      "https://www.firstfleetconcerts.com/events/detail/act-three": detail(
        "three",
        "Act Three",
        "Wooly's",
      ),
      "https://www.firstfleetconcerts.com/events/detail/act-four": detail(
        "four",
        "Act Four",
        "Wooly's",
      ),
    },
    () =>
      venueProfileAdapter.fetch(
        "https://www.firstfleetconcerts.com/first-fleet-venues/woolys",
        "events",
      ),
  );

  assert(result.success, `success, error: ${result.error}`);
  assert(
    requested[0] === "https://www.firstfleetconcerts.com/events",
    `canonical listing tried first, got ${requested[0]}`,
  );
  assert(result.items.length === 4, `4 events, got ${result.items.length}`);

  // A promoter books multiple rooms: the published venue must survive.
  const xbk = result.items.find((i) => i.title === "Act Two")!;
  assert(
    xbk.venue === "xBk Live",
    `published venue not overwritten by the Wooly's default, got ${xbk.venue}`,
  );
});

Deno.test("sports schedules drop away games and normalize titles", async () => {
  const games = [
    { name: "Iowa Wild vs Texas Stars", date: "2026-11-14T19:00:00-06:00" },
    { name: "Iowa Wild @ Milwaukee Admirals", date: "2026-11-21T19:00:00-06:00" },
    { name: "Iowa Wild vs Rockford IceHogs", date: "2026-12-05T19:00:00-06:00" },
    { name: "Iowa Wild at Grand Rapids Griffins", date: "2026-12-12T19:00:00-06:00" },
    { name: "Iowa Wild vs Chicago Wolves", date: "2027-01-09T19:00:00-06:00" },
  ].map((g) => ({
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: g.name,
    startDate: g.date,
    location: { "@type": "Place", name: "Wells Fargo Arena" },
    url: `https://www.iowawild.com/games/detail/${g.name.replace(/\W+/g, "-")}`,
  }));

  const { result } = await withSite(
    { "https://www.iowawild.com/games": `<head>${ldJson(games)}</head>` },
    () => venueProfileAdapter.fetch("https://www.iowawild.com/games", "events"),
  );

  assert(result.success, `success, error: ${result.error}`);
  assert(result.items.length === 3, `3 home games, got ${result.items.length}`);
  assert(
    !result.items.some((i) => i.title.includes("@") || / at /.test(i.title)),
    "no away games",
  );
  assert(
    result.items.every((i) => i.venue === "Wells Fargo Arena"),
    "home venue",
  );
  assert(
    result.items.every((i) => i.category === "Sports"),
    `category, got ${result.items.map((i) => i.category)}`,
  );
});

Deno.test("a client-rendered page yields nothing and falls through cleanly", async () => {
  // An empty SPA shell: no ld+json, no detail links. The adapter must report
  // failure so the dispatcher hands off to the Browserless + Claude path.
  const shell = `<html><body><div id="root"></div></body></html>`;
  const { result } = await withSite(
    {
      "https://www.theaterdesmoines.com/events": shell,
    },
    () =>
      venueProfileAdapter.fetch("https://www.theaterdesmoines.com/events/", "events"),
  );

  assert(!result.success, "must not report success");
  assert(result.items.length === 0, "no items");
  assert(
    (result.error ?? "").includes("falling through"),
    `error explains the fall-through, got: ${result.error}`,
  );
});

Deno.test("a totally unreachable site falls through rather than throwing", async () => {
  const { result } = await withSite(
    {},
    () => venueProfileAdapter.fetch("https://dmplayhouse.com/", "events"),
  );
  assert(!result.success, "must not report success");
  assert(result.items.length === 0, "no items");
});

Deno.test("only profiled, non-adapter-owned hosts are claimed", () => {
  assert(
    venueProfileAdapter.matches("https://www.iowawild.com/games"),
    "Iowa Wild is profile-crawled",
  );
  assert(
    venueProfileAdapter.matches("https://hoytsherman.org/events/"),
    "Hoyt Sherman falls back to the profile crawler when Tribe REST misses",
  );
  assert(
    !venueProfileAdapter.matches("https://www.catchdesmoines.com/events"),
    "Catch Des Moines is owned by its own adapter and must not be touched",
  );
  assert(
    !venueProfileAdapter.matches("https://www.vibrantmusichall.com/shows"),
    "Vibrant is adapter-owned",
  );
  assert(
    !venueProfileAdapter.matches("https://hyveetix.evenue.net/list/CONC"),
    "a blocked source must not be crawled",
  );
  assert(
    !venueProfileAdapter.matches("https://example.com/events"),
    "unprofiled hosts are left to the generic path",
  );
  assert(!venueProfileAdapter.supports("restaurants"), "events only");
});

Deno.test("duplicate rows from listing and detail layers collapse to the richer one", async () => {
  // The listing publishes a bare ld+json stub; the detail page has the image and
  // the deep link. One row must survive, and it must be the detail-page one.
  const listing = `<head>${
    ldJson({
      "@context": "https://schema.org",
      "@type": "MusicEvent",
      name: "Season Opener",
      startDate: "2026-10-03T19:30:00-05:00",
    })
  }</head><body><a href="/event/season-opener/">Season Opener</a></body>`;

  const { result } = await withSite(
    {
      "https://www.dmsymphony.org/concerts-events": listing,
      "https://www.dmsymphony.org/event/season-opener": detailPage(
        "Season Opener",
        "2026-10-03T19:30:00-05:00",
        "Civic Center of Greater Des Moines",
        "https://cdn.x.com/opener.jpg",
        "https://www.ticketmaster.com/event/abc",
      ),
    },
    () =>
      venueProfileAdapter.fetch("https://www.dmsymphony.org/concerts-events/", "events"),
  );

  assert(result.items.length === 1, `collapsed to 1, got ${result.items.length}`);
  assert(
    result.items[0].image_url === "https://cdn.x.com/opener.jpg",
    "the richer detail-page row won",
  );
  assert(
    result.items[0].source_url === "https://www.ticketmaster.com/event/abc",
    `deep ticket link kept, got ${result.items[0].source_url}`,
  );
});
