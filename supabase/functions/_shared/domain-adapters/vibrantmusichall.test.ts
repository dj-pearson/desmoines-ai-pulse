/**
 * Vibrant Music Hall /shows parser: start times (WEB-BE-059).
 *
 * Run with: deno test supabase/functions/_shared/domain-adapters/vibrantmusichall.test.ts
 *
 * A date-only startDate used to become 19:00, which reads as a real 7pm show
 * and gave the same concert a different instant here than from Catch Des
 * Moines. It is now the DATE ONLY, so parseEventDateTime stamps
 * NO_TIME_MARKER. The page is a hand-built ld+json fixture; parseShowsHtml
 * does no fetching, so no network or env is needed.
 *
 * node:assert rather than std/assert deliberately: it needs no network.
 */

import { strict as assert } from "node:assert";
import { parseShowsHtml } from "./vibrantmusichall.ts";

function page(...blocks: unknown[]): string {
  return `<html><head>${
    blocks.map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`).join("\n")
  }</head><body></body></html>`;
}

const show = (name: string, startDate: string, url: string) => ({
  "@type": "MusicEvent",
  name,
  startDate,
  url,
  location: { name: "Vibrant Music Hall", address: { addressLocality: "Waukee", addressRegion: "IA" } },
});

Deno.test("a date-only startDate is the date only, not 7pm", () => {
  const { items } = parseShowsHtml(
    page(show("Announced, Time TBA", "2026-12-04", "https://www.ticketmaster.com/event/a")),
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].date, "2026-12-04");
});

Deno.test("a published time is kept as the Central wall clock", () => {
  const { items, blocks } = parseShowsHtml(
    page({
      "@graph": [
        show("Doors at Eight", "2026-12-05T20:00:00-06:00", "https://www.ticketmaster.com/event/b"),
        show("Early Show", "2026-12-06T18:30", "https://www.ticketmaster.com/event/c"),
        show("Midnight Set", "2026-12-31T00:00:00-06:00", "https://www.ticketmaster.com/event/d"),
      ],
    }),
  );
  assert.equal(blocks, 3);
  assert.deepEqual(
    items.map((i) => i.date),
    ["2026-12-05 20:00:00", "2026-12-06 18:30:00", "2026-12-31 00:00:00"],
  );
});

Deno.test("an unreadable startDate drops the row rather than inventing a date", () => {
  const { items, blocks } = parseShowsHtml(
    page(show("No Date", "TBA", "https://www.ticketmaster.com/event/e")),
  );
  assert.equal(blocks, 1);
  assert.equal(items.length, 0);
});
