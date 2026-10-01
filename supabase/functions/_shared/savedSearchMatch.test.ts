/**
 * Saved-search alert matching (docs/page-plans/search.md WP5).
 * Run with: `deno test --allow-read supabase/functions/_shared/savedSearchMatch.test.ts`
 * (--allow-read is for the eventAreas.ts drift check.)
 */
import {
  alertWindowStart,
  type AlertEvent,
  buildEmail,
  deepLink,
  deliverDigest,
  EVENT_AREAS,
  eventLink,
  matchesSavedSearch,
  queryTokens,
  readSavedSearch,
  savedSearchWindow,
  searchIdsToAdvance,
  uniqueEventCount,
} from "./savedSearchMatch.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function assertEquals<T>(actual: T, expected: T, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`assertion failed: ${msg}\n  expected ${e}\n  actual   ${a}`);
}

const SITE = "https://example.test";

// Wednesday 2026-09-23 15:00 Central (CDT, UTC-5).
const NOW = new Date("2026-09-23T20:00:00Z");

function event(overrides: Partial<AlertEvent> = {}): AlertEvent {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    title: "Jazz in July",
    // Saturday 2026-09-26 19:00 Central.
    date: "2026-09-27T00:00:00Z",
    end_date: null,
    event_start_utc: null,
    category: "Music",
    location: "Des Moines Social Club",
    venue: "Des Moines Social Club",
    city: "Des Moines",
    price: "$15",
    latitude: null,
    longitude: null,
    original_description: null,
    enhanced_description: null,
    created_at: "2026-09-23T10:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Acceptance
// ---------------------------------------------------------------------------

Deno.test("location=west-des-moines matches an event whose city is West Des Moines", () => {
  const wdm = event({ city: "West Des Moines", location: "Valley West Mall" });
  assert(matchesSavedSearch(wdm, { location: "west-des-moines" }, NOW), "WDM city row matches");
  // And the old substring bug in reverse: Des Moines must not take WDM rows.
  assert(!matchesSavedSearch(wdm, { location: "des-moines" }, NOW), "des-moines excludes WDM");
});

Deno.test("downtown matches by coordinates, and a row without coordinates is not downtown", () => {
  const inside = event({ city: "Des Moines", latitude: 41.585, longitude: -93.625 });
  const outside = event({ city: "Des Moines", latitude: 41.62, longitude: -93.7 });
  const noCoords = event({ city: "Des Moines", location: "Downtown Des Moines" });
  assert(matchesSavedSearch(inside, { location: "downtown" }, NOW), "inside the bbox");
  assert(!matchesSavedSearch(outside, { location: "downtown" }, NOW), "outside the bbox");
  assert(!matchesSavedSearch(noCoords, { location: "downtown" }, NOW), "no coordinates");
});

Deno.test("an iOS row {query:'jazz'} doesn't match an event titled Farmers Market", () => {
  const market = event({ title: "Farmers Market", venue: "Court Avenue", location: "Court Avenue", category: "Market" });
  assert(!matchesSavedSearch(market, { query: "jazz", tab: "events" }, NOW), "query key is read");
  assert(matchesSavedSearch(event(), { query: "jazz", tab: "events" }, NOW), "and a jazz event does match");
});

Deno.test("preset=this-weekend excludes an event 10 days out", () => {
  const tenDaysOut = event({ date: new Date(NOW.getTime() + 10 * 86_400_000).toISOString() });
  assert(!matchesSavedSearch(tenDaysOut, { preset: "this-weekend" }, NOW), "10 days out");
  assert(matchesSavedSearch(event(), { preset: "this-weekend" }, NOW), "Saturday evening is in");
});

Deno.test("price=free excludes a NULL price and keeps a free one", () => {
  assert(!matchesSavedSearch(event({ price: null }), { price: "free" }, NOW), "NULL is not free");
  assert(!matchesSavedSearch(event({ price: "$0-$25" }), { price: "free" }, NOW), "range from zero");
  assert(matchesSavedSearch(event({ price: "Free admission" }), { price: "free" }, NOW), "Free text");
  assert(matchesSavedSearch(event({ price: "$0" }), { price: "free" }, NOW), "$0");
});

Deno.test("an item link goes to the event's page with a date suffix", () => {
  const link = eventLink(event(), SITE);
  assert(link.includes("/events/"), link);
  // 00:00 UTC on the 27th is 19:00 Central on the 26th: the suffix is Central.
  assert(link.startsWith(`${SITE}/events/jazz-in-july-2026-09-26?`), link);
  assert(link.includes("utm_source=saved-search") && link.includes("utm_medium=email"), link);

  const html = buildEmail([{ name: "Jazz", link: deepLink({ q: "jazz" }, SITE), events: [event()] }], SITE).html;
  assert(html.includes("/events/jazz-in-july-2026-09-26?"), "email body carries the event link");
});

// ---------------------------------------------------------------------------
// Area table drift
// ---------------------------------------------------------------------------

Deno.test("EVENT_AREAS slugs are the same set as src/lib/eventAreas.ts", async () => {
  const source = await Deno.readTextFile(new URL("../../../src/lib/eventAreas.ts", import.meta.url));
  const block = source.slice(source.indexOf("export const EVENT_AREAS"), source.indexOf("export function findEventArea"));
  const webSlugs = [...block.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]).sort();
  const ours = EVENT_AREAS.map((a) => a.slug).sort();
  assert(webSlugs.length > 0, "parsed some slugs from eventAreas.ts");
  assertEquals(ours, webSlugs, "area slugs");
});

// ---------------------------------------------------------------------------
// Delivery bookkeeping
// ---------------------------------------------------------------------------

Deno.test("a Resend 500 leaves that user's searches un-advanced", async () => {
  const searches = [
    { id: "s-failed", user_id: "u-failed" },
    { id: "s-failed-quiet", user_id: "u-failed" },
    { id: "s-sent", user_id: "u-sent" },
    { id: "s-skipped", user_id: "u-optout" },
    { id: "s-quiet", user_id: "u-none" },
  ];
  const matched = new Set(["s-failed", "s-sent", "s-skipped"]);

  const failures: string[] = [];
  const failedOutcome = await deliverDigest(
    () => Promise.resolve(new Response("upstream error", { status: 500 })),
    (d) => failures.push(d),
  );
  const sentOutcome = await deliverDigest(() => Promise.resolve(new Response("{}", { status: 200 })));
  const thrownOutcome = await deliverDigest(() => Promise.reject(new Error("timeout")));
  assertEquals(failedOutcome, "failed", "500 is a failure");
  assertEquals(sentOutcome, "sent", "200 is sent");
  assertEquals(thrownOutcome, "failed", "a throw is a failure");
  assertEquals(failures, ["status 500"], "failure is reported");

  const outcomes = new Map([
    ["u-failed", failedOutcome],
    ["u-sent", sentOutcome],
    ["u-optout", "skipped" as const],
  ]);
  const ids = searchIdsToAdvance(searches, matched, outcomes);
  assert(!ids.includes("s-failed"), "the failed user's matched search keeps its window");
  assertEquals(ids, ["s-failed-quiet", "s-sent", "s-skipped", "s-quiet"], "everything else advances");
});

Deno.test("the window reaches back at most 7 days, and one day for a first run", () => {
  const month = new Date(NOW.getTime() - 30 * 86_400_000).toISOString();
  assertEquals(alertWindowStart(month, NOW), NOW.getTime() - 7 * 86_400_000, "clamped to 7 days");
  assertEquals(alertWindowStart(null, NOW), NOW.getTime() - 86_400_000, "first run is one day");
  const hourAgo = new Date(NOW.getTime() - 3_600_000).toISOString();
  assertEquals(alertWindowStart(hourAgo, NOW), NOW.getTime() - 3_600_000, "recent run kept");
});

Deno.test("one event in two searches counts once in the subject", () => {
  const a = event();
  const b = event({ id: "other" });
  assertEquals(uniqueEventCount([{ events: [a, b] }, { events: [a] }]), 2, "deduped");
});

// ---------------------------------------------------------------------------
// The rest of the page's rules
// ---------------------------------------------------------------------------

Deno.test("q is every word, across title, venue, location, city and description", () => {
  const ev = event({ title: "Friday Night Live", venue: "Wooly's", enhanced_description: "A jazz trio plays." });
  assert(matchesSavedSearch(ev, { q: "jazz wooly's" }, NOW), "venue plus description");
  assert(!matchesSavedSearch(ev, { q: "jazz blues" }, NOW), "every word is required");
  assert(!matchesSavedSearch(ev, { q: "jazz -trio" }, NOW), "a minus word excludes");
  assertEquals(queryTokens("the Jazz and Blues").required, ["jazz", "blues"], "stopwords dropped");
});

Deno.test("q wins over query, and placeholders read as unset", () => {
  const c = readSavedSearch({ q: "jazz", query: "blues", location: "any-location", price: "any-price", category: "all" });
  assertEquals([c.q, c.location, c.price, c.category], ["jazz", "", "", ""], "normalized");
  assertEquals(readSavedSearch(null).q, "", "null filters");
  assertEquals(readSavedSearch("jazz").q, "", "string filters");
});

Deno.test("from/to bound the Central day, inclusive", () => {
  const w = savedSearchWindow({ preset: "", from: "2026-09-26", to: "" }, NOW);
  assert(w !== null, "window");
  assert(matchesSavedSearch(event(), { from: "2026-09-26" }, NOW), "same Central day");
  assert(!matchesSavedSearch(event(), { from: "2026-09-27" }, NOW), "the UTC day is not the Central day");
  assert(matchesSavedSearch(event(), { from: "2026-09-25", to: "2026-09-28" }, NOW), "range");
  assertEquals(savedSearchWindow({ preset: "", from: "not-a-day", to: "" }, NOW), null, "junk is no filter");
});

Deno.test("with no date filter an event must be upcoming, as on the hub", () => {
  const earlierToday = event({ date: "2026-09-23T14:00:00Z" }); // 9am Central today
  const yesterday = event({ date: "2026-09-22T14:00:00Z" });
  const stillRunning = event({ date: "2026-09-20T14:00:00Z", end_date: "2026-09-30T00:00:00Z" });
  assert(matchesSavedSearch(earlierToday, {}, NOW), "started earlier today");
  assert(!matchesSavedSearch(yesterday, {}, NOW), "yesterday");
  assert(matchesSavedSearch(stillRunning, {}, NOW), "multi-day still running");
});

Deno.test("category is exact, case aside; an unknown area slug is no filter", () => {
  assert(matchesSavedSearch(event(), { category: "music" }, NOW), "case-insensitive");
  assert(!matchesSavedSearch(event(), { category: "Musical" }, NOW), "not a substring");
  assert(matchesSavedSearch(event(), { location: "near me" }, NOW), "unknown slug");
});

Deno.test("an event with no title or date links by id", () => {
  const link = eventLink(event({ title: "", date: null }), SITE);
  assert(link.startsWith(`${SITE}/events/11111111-2222-3333-4444-555555555555?`), link);
  const utc = eventLink(event({ event_start_utc: "2026-10-02T01:30:00Z", date: "2026-10-03T00:00:00Z" }), SITE);
  assert(utc.includes("jazz-in-july-2026-10-01?"), `event_start_utc wins: ${utc}`);
});

Deno.test("the deep link carries the saved keys, reads iOS query, and tags the source", () => {
  const link = new URL(deepLink({ query: "jazz", location: "downtown", preset: "this-weekend", from: "2026-01-01" }, SITE));
  assertEquals(link.pathname, "/events", "path");
  assertEquals(link.searchParams.get("q"), "jazz", "q from query");
  assertEquals(link.searchParams.get("location"), "downtown", "area");
  assertEquals(link.searchParams.get("preset"), "this-weekend", "preset");
  assertEquals(link.searchParams.get("from"), null, "preset wins over from, as on the hub");
  assertEquals(link.searchParams.get("utm_source"), "saved-search", "utm");
});

Deno.test("the email escapes what it prints", () => {
  const { html, text } = buildEmail(
    [{ name: "<b>mine</b>", link: `${SITE}/events?q=a&b=c`, events: [event({ title: "Rock & <Roll>" })] }],
    SITE,
  );
  assert(!html.includes("<b>mine</b>") && html.includes("&lt;b&gt;mine"), "name escaped");
  assert(html.includes("Rock &amp; &lt;Roll&gt;"), "title escaped");
  assert(html.includes("q=a&amp;b=c"), "href escaped");
  assert(text.includes("/events/rock-roll-2026-09-26?"), "text version links the event");
});
