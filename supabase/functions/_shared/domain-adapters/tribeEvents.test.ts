/**
 * Unit tests for the WordPress "The Events Calendar" REST adapter.
 * Run with: `deno test --allow-none supabase/functions/_shared/domain-adapters/tribeEvents.test.ts`
 *
 * `globalThis.fetch` is stubbed, so no network access is needed. The payloads
 * below match the plugin's documented /wp-json/tribe/events/v1/events response
 * shape, including the awkward bits: HTML entities in titles, `image: false`
 * when no featured image is set, a `venue` that can arrive as an object or an
 * array, all-day events, and a non-JSON 200 from a site without the plugin.
 */
import { normalizeStartDate, tribeEventsAdapter } from "./tribeEvents.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

type Handler = (url: string) => { status: number; body: string; json?: boolean };

/** Swap in a fetch stub for the duration of `run`. */
async function withFetch<T>(handler: Handler, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    const { status, body, json = true } = handler(url);
    return Promise.resolve(
      new Response(body, {
        status,
        headers: {
          "content-type": json ? "application/json" : "text/html; charset=utf-8",
        },
      }),
    );
    // deno-lint-ignore no-explicit-any
  }) as any;
  // fetchAllowed goes through fetchPublicUrl (WEB-SEC-061), which resolves the
  // host before fetching and fails closed when it cannot. Answer the lookup
  // with a public literal so the suite still needs no --allow-net.
  const originalResolve = Deno.resolveDns;
  Object.defineProperty(Deno, "resolveDns", {
    configurable: true,
    writable: true,
    value: (_host: string, type: string) =>
      Promise.resolve(type === "A" ? ["93.184.216.34"] : []),
  });
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
    Object.defineProperty(Deno, "resolveDns", {
      configurable: true,
      writable: true,
      value: originalResolve,
    });
  }
}

const FULL_PAYLOAD = JSON.stringify({
  total: 3,
  total_pages: 1,
  events: [
    {
      id: 101,
      title: "An Evening with Someone &amp; Friends",
      excerpt: "<p>An intimate acoustic set.</p>",
      url: "https://hoytsherman.org/event/an-evening-with-someone/",
      start_date: "2026-09-12 20:00:00",
      end_date: "2026-09-12 22:30:00",
      all_day: false,
      timezone: "America/Chicago",
      cost: "$35 - $65",
      status: "publish",
      image: {
        url: "https://hoytsherman.org/wp-content/uploads/thumb.jpg",
        sizes: {
          medium: { url: "https://hoytsherman.org/wp-content/uploads/med.jpg", width: 300 },
          full: { url: "https://hoytsherman.org/wp-content/uploads/full.jpg", width: 1600 },
        },
      },
      venue: {
        venue: "Hoyt Sherman Place",
        address: "1501 Woodland Ave",
        city: "Des Moines",
        state: "IA",
        zip: "50309",
      },
      categories: [{ name: "Concerts" }],
    },
    {
      id: 102,
      title: "Gallery Open House",
      excerpt: "",
      url: "https://hoytsherman.org/event/gallery-open-house/",
      start_date: "2026-09-20 00:00:00",
      all_day: true,
      cost: "Free",
      status: "publish",
      image: false,
      // Some installs serialize venue as a single-element array.
      venue: [{ venue: "Hoyt Sherman Place", city: "Des Moines", state: "IA" }],
      categories: [{ name: "Art Gallery" }],
    },
    {
      id: 103,
      title: "Draft Event",
      start_date: "2026-10-01 19:00:00",
      status: "draft",
      url: "https://hoytsherman.org/event/draft/",
    },
  ],
});

Deno.test("maps a Tribe payload into complete AdapterEvents", async () => {
  const result = await withFetch(
    (url) =>
      url.includes("/wp-json/tribe/events/v1/events")
        ? { status: 200, body: FULL_PAYLOAD }
        : { status: 404, body: "{}" },
    () => tribeEventsAdapter.fetch("https://hoytsherman.org/events/", "events"),
  );

  assert(result.success, `success, error was: ${result.error}`);
  assert(result.items.length === 2, `2 published events, got ${result.items.length}`);

  const [concert, openHouse] = result.items;

  assert(
    concert.title === "An Evening with Someone & Friends",
    `entities decoded, got "${concert.title}"`,
  );
  assert(concert.date === "2026-09-12 20:00:00", `exact start time, got ${concert.date}`);
  assert(concert.venue === "Hoyt Sherman Place", "venue from the plugin");
  assert(
    concert.location === "1501 Woodland Ave, Des Moines, IA, 50309",
    `full address, got ${concert.location}`,
  );
  assert(concert.category === "Music", `Concerts → Music, got ${concert.category}`);
  assert(concert.price === "$35 - $65", `cost passed through, got ${concert.price}`);
  assert(
    concert.image_url === "https://hoytsherman.org/wp-content/uploads/full.jpg",
    `largest size chosen, got ${concert.image_url}`,
  );
  assert(
    concert.source_url === "https://hoytsherman.org/event/an-evening-with-someone/",
    "per-event permalink, not the listing page",
  );
  assert(
    concert.description === "An intimate acoustic set.",
    `excerpt de-tagged, got "${concert.description}"`,
  );

  // WEB-BE-059: an all-day event is the DATE ONLY, so the shared parser stamps
  // NO_TIME_MARKER. Not 00:00 (reads as "yesterday" in a day view) and not
  // 19:00 (reads as a real 7pm show).
  assert(
    openHouse.date === "2026-09-20",
    `all-day → date only, got ${openHouse.date}`,
  );
  assert(openHouse.price === "Free", "Free normalized");
  assert(openHouse.image_url === null, "image:false → null");
  assert(openHouse.venue === "Hoyt Sherman Place", "venue array form handled");
  assert(openHouse.category === "Arts", `Art Gallery → Arts, got ${openHouse.category}`);
});

Deno.test("a site without the plugin fails cleanly so the next adapter runs", async () => {
  const result = await withFetch(
    () => ({ status: 404, body: '{"code":"rest_no_route"}' }),
    () => tribeEventsAdapter.fetch("https://dmplayhouse.com/shows/", "events"),
  );
  assert(!result.success, "must not report success");
  assert(result.items.length === 0, "no items");
  assert(
    (result.error ?? "").includes("falling through"),
    `error should say it is falling through, got: ${result.error}`,
  );
});

Deno.test("an HTML 200 (SPA/404 page) is not parsed as JSON", async () => {
  const result = await withFetch(
    () => ({ status: 200, body: "<!doctype html><html>Not found</html>", json: false }),
    () => tribeEventsAdapter.fetch("https://www.theaterdesmoines.com/events/", "events"),
  );
  assert(!result.success, "HTML content-type must be rejected");
});

Deno.test("an empty events array is a fall-through, not a success", async () => {
  const result = await withFetch(
    () => ({ status: 200, body: '{"events":[],"total":0}' }),
    () => tribeEventsAdapter.fetch("https://hoytsherman.org/events/", "events"),
  );
  assert(!result.success, "zero events must fall through");
});

Deno.test("only hosts whose profile declares tribe-rest are probed", () => {
  assert(
    tribeEventsAdapter.matches("https://hoytsherman.org/events/"),
    "Hoyt Sherman declares tribe-rest",
  );
  assert(
    tribeEventsAdapter.matches("https://www.dmsymphony.org/concerts-events/"),
    "Symphony declares tribe-rest",
  );
  assert(
    !tribeEventsAdapter.matches("https://www.catchdesmoines.com/events"),
    "Catch Des Moines is adapter-owned and must not be probed",
  );
  assert(
    !tribeEventsAdapter.matches("https://seatgeek.com/search?f=1"),
    "SeatGeek must not be probed",
  );
  assert(
    !tribeEventsAdapter.matches("https://example.com/events/"),
    "unknown hosts must not be probed",
  );
  assert(!tribeEventsAdapter.supports("restaurants"), "events only");
});

Deno.test("the hyphenated Hoyt Sherman alias probes the real host", async () => {
  // Existing job rows may hold hoyt-sherman.org; the profile's canonical listing
  // URL must decide which origin is probed.
  const probed: string[] = [];
  await withFetch(
    (url) => {
      probed.push(url);
      return { status: 200, body: FULL_PAYLOAD };
    },
    () => tribeEventsAdapter.fetch("https://hoyt-sherman.org/events/", "events"),
  );
  assert(
    probed[0].startsWith("https://hoytsherman.org/wp-json/"),
    `probed the canonical origin, got ${probed[0]}`,
  );
});

Deno.test("pagination stops once a short page arrives", async () => {
  const pageOne = JSON.stringify({
    total: 51,
    events: Array.from({ length: 50 }, (_, i) => ({
      id: i,
      title: `Event ${i}`,
      start_date: "2026-09-01 19:00:00",
      status: "publish",
      url: `https://hoytsherman.org/event/e${i}/`,
    })),
  });
  const pageTwo = JSON.stringify({
    total: 51,
    events: [{
      id: 99,
      title: "Last One",
      start_date: "2026-09-02 19:00:00",
      status: "publish",
      url: "https://hoytsherman.org/event/last/",
    }],
  });

  let calls = 0;
  const result = await withFetch(
    (url) => {
      calls++;
      return { status: 200, body: url.includes("page=1") ? pageOne : pageTwo };
    },
    () => tribeEventsAdapter.fetch("https://hoytsherman.org/events/", "events"),
  );

  assert(result.items.length === 51, `all 51 events, got ${result.items.length}`);
  assert(calls === 2, `stopped after the short page, made ${calls} calls`);
});

// WEB-BE-059. Every no-time shape is the date only, so the shared parser stamps
// NO_TIME_MARKER; a published time passes through untouched.
Deno.test("normalizeStartDate: date only when there is no time, verbatim when there is", () => {
  const norm = (start_date: string, all_day = false) => normalizeStartDate({ start_date, all_day });
  assert(norm("2026-09-20 00:00:00", true) === "2026-09-20", "all-day midnight → date only");
  assert(norm("2026-09-20 18:00:00", true) === "2026-09-20", "all-day with a clock → date only");
  assert(norm("2026-09-20") === "2026-09-20", "bare date → date only");
  assert(norm("2026-09-12 20:00:00") === "2026-09-12 20:00:00", "timed start unchanged");
  assert(norm("2026-09-12T19:30") === "2026-09-12 19:30:00", "T separator, no seconds → :00");
  assert(norm("2026-09-12 00:00:00") === "2026-09-12 00:00:00", "a published midnight is kept");
  assert(norm("soon") === null, "unreadable → null");
});
