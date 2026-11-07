/**
 * Eventbrite browse adapter: where the event list is read from, and that a
 * blob with no list is a failure rather than a quiet week (WEB-BE-058).
 *
 * Run with: deno test supabase/functions/_shared/domain-adapters/eventbrite.test.ts
 *
 * The fixtures are hand-trimmed to the fields the adapter reads. They are NOT
 * captured from a live page: this container's proxy refuses eventbrite.com,
 * so AC1 (record the live shape) and AC3 (a trimmed real fixture) are still
 * open. What this file pins is the behaviour that does not depend on the
 * guess being right: every known path is read, an unknown path is found by
 * the scan, and a total miss returns success: false.
 *
 * node:assert rather than std/assert deliberately: it needs no network.
 */

import { strict as assert } from "node:assert";
import { findEventList, formatDateTime, parseBrowseHtml } from "./eventbrite.ts";

function page(blob: unknown): string {
  return `<html><head><script>window.__SERVER_DATA__ = ${
    JSON.stringify(blob)
  };\n</script></head><body></body></html>`;
}

const usd = (major: string) => ({ currency: "USD", major_value: major });

const JAZZ = {
  eventbrite_event_id: "1001",
  name: "Jazz in July Kickoff",
  summary: "Outdoor set",
  start_date: "2026-12-05",
  start_time: "19:30",
  timezone: "America/Chicago",
  url: "https://www.eventbrite.com/e/jazz-tickets-1001",
  primary_venue: {
    name: "Wooly's",
    address: { city: "Des Moines", region: "IA", localized_area_display: "Des Moines, IA" },
  },
  ticket_availability: {
    is_free: false,
    minimum_ticket_price: usd("25.00"),
    maximum_ticket_price: usd("60.00"),
  },
};

const MARKET = {
  eventbrite_event_id: "1002",
  name: "Winter Farmers Market",
  start_date: "2026-12-12",
  start_time: "09:00",
  timezone: "America/Chicago",
  url: "https://www.eventbrite.com/e/market-tickets-1002",
  primary_venue: { name: "Valley Junction" },
  ticket_availability: { is_free: true },
};

function assertTwoEvents(html: string) {
  const result = parseBrowseHtml(html);
  assert.equal(result.success, true, result.error);
  assert.equal(result.items.length, 2);
  const [jazz, market] = result.items;
  assert.equal(jazz.title, "Jazz in July Kickoff");
  assert.equal(jazz.date, "2026-12-05 19:30:00");
  assert.equal(jazz.price, "$25-$60");
  assert.equal(jazz.venue, "Wooly's");
  assert.equal(market.title, "Winter Farmers Market");
  assert.equal(market.date, "2026-12-12 09:00:00");
  assert.equal(market.price, "Free");
}

Deno.test("buckets[*].events, the shape the adapter was written against", () => {
  const blob = { buckets: [{ events: [JAZZ] }, { events: [MARKET] }] };
  assert.equal(findEventList(blob)?.path, "buckets[*].events");
  assertTwoEvents(page(blob));
});

Deno.test("search_data.events.results, the destination-search shape", () => {
  const blob = { search_data: { events: { results: [JAZZ, MARKET] } } };
  assert.equal(findEventList(blob)?.path, "search_data.events.results");
  assertTwoEvents(page(blob));
});

Deno.test("empty buckets do not hide a populated search_data list", () => {
  const blob = { buckets: [{ events: [] }], search_data: { events: { results: [JAZZ, MARKET] } } };
  assert.equal(findEventList(blob)?.path, "search_data.events.results");
  assertTwoEvents(page(blob));
});

Deno.test("a list moved somewhere unknown is found by the scan and the path is named", () => {
  const blob = {
    meta: { city: "des-moines" },
    props: { feed: { sections: [{ title: "This weekend" }, { cards: [JAZZ, MARKET] }] } },
  };
  assert.equal(findEventList(blob)?.path, "scan:props.feed.sections[1].cards");
  assertTwoEvents(page(blob));
});

Deno.test("the scan accepts a renamed id when name, start_date and an eventbrite url are there", () => {
  const { eventbrite_event_id: _id, ...noId } = JAZZ;
  const list = findEventList({ data: { items: [{ ...noId, id: "x" }] } });
  assert.equal(list?.path, "scan:data.items");
  assert.equal(list?.events.length, 1);
});

Deno.test("a blob with no event list fails loudly instead of returning zero rows", () => {
  const blob = { user: { id: null }, flags: { new_search: true }, related: [{ name: "Concerts" }] };
  assert.equal(findEventList(blob), null);
  const result = parseBrowseHtml(page(blob));
  assert.equal(result.success, false);
  assert.equal(result.items.length, 0);
  assert.match(result.error ?? "", /holds no event list/);
  assert.match(result.error ?? "", /top-level keys: user, flags, related/);
});

Deno.test("a known path that is present but empty is a real empty week", () => {
  const result = parseBrowseHtml(page({ buckets: [{ events: [] }] }));
  assert.equal(result.success, true);
  assert.equal(result.items.length, 0);
});

Deno.test("online, cancelled, non-Central and repeated events are dropped", () => {
  const blob = {
    buckets: [{
      events: [
        JAZZ,
        { ...JAZZ },
        { ...MARKET, eventbrite_event_id: "2", is_online_event: true },
        { ...MARKET, eventbrite_event_id: "3", is_cancelled: true },
        { ...MARKET, eventbrite_event_id: "4", timezone: "America/New_York" },
      ],
    }],
  };
  const result = parseBrowseHtml(page(blob));
  assert.equal(result.success, true);
  assert.deepEqual(result.items.map((i) => i.title), ["Jazz in July Kickoff"]);
});

Deno.test("no blob and a broken blob are still failures", () => {
  assert.equal(parseBrowseHtml("<html></html>").success, false);
  const broken = parseBrowseHtml("<script>window.__SERVER_DATA__ = {\"a\": };\n</script>");
  assert.equal(broken.success, false);
  assert.match(broken.error ?? "", /Failed to parse/);
});

// WEB-BE-059. A missing start_time used to become 7pm, which reads as a real
// showtime and disagrees with every other producer. The adapter now hands the
// shared parser a bare date, and parseEventDateTime stamps NO_TIME_MARKER.
Deno.test("an event with no start_time is the date only, not 7pm", () => {
  const { start_time: _omit, ...noTime } = MARKET;
  const result = parseBrowseHtml(page({ buckets: [{ events: [noTime, JAZZ] }] }));
  assert.equal(result.success, true, result.error);
  const byTitle = new Map(result.items.map((i) => [i.title, i.date]));
  assert.equal(byTitle.get("Winter Farmers Market"), "2026-12-12");
  assert.equal(byTitle.get("Jazz in July Kickoff"), "2026-12-05 19:30:00");
});

Deno.test("formatDateTime keeps a published time and drops an unreadable one", () => {
  assert.equal(formatDateTime("2026-12-05", "17:30"), "2026-12-05 17:30:00");
  assert.equal(formatDateTime("2026-12-05", "00:00"), "2026-12-05 00:00:00");
  assert.equal(formatDateTime("2026-12-05"), "2026-12-05");
  assert.equal(formatDateTime("2026-12-05", ""), "2026-12-05");
  assert.equal(formatDateTime("2026-12-05", "7pm"), "2026-12-05");
});
