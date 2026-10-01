/**
 * The dedup index must give the verdict a full scan gives, and the loader must
 * read every row in the window rather than the first page of it.
 *
 * Run: `deno test supabase/functions/_shared/existingEvents.test.ts`
 */
import { assert, assertEquals, assertFalse, assertRejects } from "jsr:@std/assert@1";
import {
  createDedupIndex,
  generateEventFingerprint,
  isDuplicateEvent,
  type DedupEvent,
  type ExistingEvent,
} from "./eventDedup.ts";
import { dedupWindow, loadExistingEvents } from "./existingEvents.ts";

function existing(id: string, title: string, date: string, venue: string, source_url = "https://a.example/x"): ExistingEvent {
  return {
    id,
    title,
    date,
    venue,
    source_url,
    fingerprint: generateEventFingerprint({ title, date: new Date(date), venue, source_url }),
  };
}

function incoming(title: string, date: string, venue: string, source_url = "https://b.example/y"): DedupEvent {
  return {
    title,
    date: new Date(date),
    venue,
    source_url,
    fingerprint: generateEventFingerprint({ title, date: new Date(date), venue, source_url }),
  };
}

Deno.test("a multi-night run is three events, not one", () => {
  // The bug this replaces: a title+venue lookup with no date, so nights two and
  // three matched night one and were never written.
  const index = createDedupIndex([
    existing("1", "Hamilton", "2026-10-02T00:30:00Z", "Des Moines Civic Center"),
  ]);
  assertFalse(index.find(incoming("Hamilton", "2026-10-03T00:30:00Z", "Des Moines Civic Center")).isDuplicate);
  assertFalse(index.find(incoming("Hamilton", "2026-10-04T00:30:00Z", "Des Moines Civic Center")).isDuplicate);
  assert(index.find(incoming("Hamilton", "2026-10-02T00:30:00Z", "Des Moines Civic Center")).isDuplicate);
});

Deno.test("an 8pm Central show matches across the UTC midnight it straddles", () => {
  // 8pm CDT on Sep 25 is 01:00Z on Sep 26. Same Central day, different UTC day.
  const index = createDedupIndex([
    existing("1", "George Thorogood & The Destroyers", "2026-09-26T01:00:00Z", "Hoyt Sherman Place"),
  ]);
  const verdict = index.find(
    incoming("George Thorogood and the Destroyers: The Baddest Show on Earth", "2026-09-25T23:00:00Z", "Hoyt Sherman Place"),
  );
  assert(verdict.isDuplicate);
  assertEquals(verdict.existingEvent?.id, "1");
});

Deno.test("the index agrees with a full scan on every pair", () => {
  const rows: ExistingEvent[] = [];
  const titles = ["Comedy Night: Bob", "Comedy Night: Sue", "Iowa Cubs vs Omaha", "Symphony Pops", "Symphony Pops: Encore"];
  const venues = ["Wooly's", "Principal Park", "Des Moines Civic Center"];
  let n = 0;
  for (const t of titles) {
    for (const v of venues) {
      for (let day = 1; day <= 5; day++) {
        rows.push(existing(String(n++), t, `2026-11-0${day}T0${day}:00:00Z`, v, day % 2 ? "https://a.example/x" : "https://c.example/z"));
      }
    }
  }
  const index = createDedupIndex(rows);
  for (const t of [...titles, "Symphony Pops Live"]) {
    for (const v of venues) {
      for (const hour of ["2026-11-03T02:00:00Z", "2026-11-03T18:00:00Z", "2026-11-07T01:00:00Z"]) {
        const probe = incoming(t, hour, v, "https://a.example/x");
        const scan = isDuplicateEvent(probe, rows);
        const indexed = index.find(probe);
        // The VERDICT, not the reason: isDuplicateEvent returns the first ROW
        // that matches any tier, so which reason is reported depends on list
        // order, and bucketing by day changes the order.
        assertEquals(indexed.isDuplicate, scan.isDuplicate, `${t} @ ${v} ${hour}`);
      }
    }
  }
});

Deno.test("a row added mid-run catches the second copy of the same event", () => {
  const index = createDedupIndex<ExistingEvent>([]);
  const first = incoming("Des Moines Arts Festival", "2026-06-27T15:00:00Z", "Western Gateway Park");
  assertFalse(index.find(first).isDuplicate);
  index.add(existing("new-1", first.title, first.date.toISOString(), first.venue));
  assertEquals(index.size, 1);
  assertEquals(index.find(first).existingEvent?.id, "new-1");
});

Deno.test("dedupWindow pads the item range by a day and ignores invalid dates", () => {
  const w = dedupWindow([new Date("2026-10-05T12:00:00Z"), new Date("invalid"), new Date("2026-10-01T12:00:00Z")]);
  assertEquals(w?.from.toISOString(), "2026-09-30T12:00:00.000Z");
  assertEquals(w?.to.toISOString(), "2026-10-06T12:00:00.000Z");
  assertEquals(dedupWindow([]), null);
});

/** A stand-in for the PostgREST builder: records the range asked for and hands
 *  back at most `maxRows` rows, the way a project's max-rows setting does. */
function fakeClient(total: number, maxRows: number, failAt = -1) {
  const calls: Array<[number, number]> = [];
  const all = Array.from({ length: total }, (_, i) => ({
    id: String(i).padStart(6, "0"),
    title: `Event ${i}`,
    date: "2026-10-01T00:00:00Z",
    venue: "Somewhere",
    source_url: null,
    image_url: null,
  }));
  const builder = {
    select() { return builder; },
    gte() { return builder; },
    lte() { return builder; },
    order() { return builder; },
    range(from: number, to: number) {
      calls.push([from, to]);
      if (calls.length - 1 === failAt) return Promise.resolve({ data: null, error: { message: "boom" } });
      const end = Math.min(to + 1, from + maxRows);
      return Promise.resolve({ data: all.slice(from, end), error: null });
    },
  };
  return { client: { from: () => builder }, calls };
}

const window = { from: new Date("2026-09-30T00:00:00Z"), to: new Date("2026-10-02T00:00:00Z") };

Deno.test("loadExistingEvents reads past the first page", async () => {
  const { client, calls } = fakeClient(2500, 1000);
  // deno-lint-ignore no-explicit-any
  const rows = await loadExistingEvents(client as any, window);
  assertEquals(rows.length, 2500);
  assertEquals(calls.length, 4); // three pages and the empty one that ends it
});

Deno.test("loadExistingEvents is not fooled by a max-rows below its page size", async () => {
  // A short page is not the end when the server caps every page at 300.
  const { client } = fakeClient(1100, 300);
  // deno-lint-ignore no-explicit-any
  const rows = await loadExistingEvents(client as any, window);
  assertEquals(rows.length, 1100);
  assert(rows.every((r) => typeof r.fingerprint === "string" && r.source_url === ""));
});

Deno.test("loadExistingEvents throws on a failed page rather than returning a prefix", async () => {
  const { client } = fakeClient(2500, 1000, 1);
  // deno-lint-ignore no-explicit-any
  await assertRejects(() => loadExistingEvents(client as any, window), Error, "boom");
});
