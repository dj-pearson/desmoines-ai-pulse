/**
 * Unit tests for the adapter dispatch loop.
 * Run with: `deno test --allow-none supabase/functions/_shared/domain-adapters/dispatch.test.ts`
 *
 * The behaviour under test is the fall-through: a cheap probe that misses must
 * hand the URL to the next matching adapter. Before this, dispatch stopped at
 * the first `matches()` hit, so registering a generic adapter behind a
 * site-specific one made it unreachable.
 */
import { runAdapters } from "./dispatch.ts";
import type { AdapterEvent, AdapterResult, DomainAdapter } from "./types.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const sampleEvent: AdapterEvent = {
  title: "Test Event",
  description: "",
  date: "2026-09-01 19:00:00",
  location: "Des Moines, IA",
  venue: "Somewhere",
  category: "Music",
};

function adapter(
  name: string,
  outcome: "items" | "empty" | "fail" | "throw",
  calls: string[],
): DomainAdapter {
  return {
    name,
    matches: () => true,
    supports: (c) => c === "events",
    fetch: (): Promise<AdapterResult> => {
      calls.push(name);
      if (outcome === "throw") throw new Error(`${name} exploded`);
      if (outcome === "fail") {
        return Promise.resolve({ success: false, items: [], adapter: name, error: "nope" });
      }
      return Promise.resolve({
        success: true,
        items: outcome === "items" ? [sampleEvent] : [],
        adapter: name,
      });
    },
  };
}

Deno.test("the first adapter that returns items wins and later ones are skipped", async () => {
  const calls: string[] = [];
  const result = await runAdapters(
    [adapter("first", "items", calls), adapter("second", "items", calls)],
    "https://example.com/events",
    "events",
  );
  assert(result?.adapter === "first", `first wins, got ${result?.adapter}`);
  assert(calls.join(",") === "first", `second must not run, calls: ${calls}`);
});

Deno.test("a failing adapter falls through to the next candidate", async () => {
  const calls: string[] = [];
  const result = await runAdapters(
    [adapter("probe", "fail", calls), adapter("crawler", "items", calls)],
    "https://example.com/events",
    "events",
  );
  assert(result?.adapter === "crawler", `fell through, got ${result?.adapter}`);
  assert(calls.join(",") === "probe,crawler", `both ran, calls: ${calls}`);
});

Deno.test("an adapter returning zero items falls through", async () => {
  const calls: string[] = [];
  const result = await runAdapters(
    [adapter("empty", "empty", calls), adapter("crawler", "items", calls)],
    "https://example.com/events",
    "events",
  );
  assert(result?.adapter === "crawler", "zero items is a miss, not a result");
});

Deno.test("a throwing adapter never blocks the next candidate", async () => {
  const calls: string[] = [];
  const result = await runAdapters(
    [adapter("boom", "throw", calls), adapter("crawler", "items", calls)],
    "https://example.com/events",
    "events",
  );
  assert(result?.adapter === "crawler", "exception is contained");
  assert(calls.join(",") === "boom,crawler", `both ran, calls: ${calls}`);
});

Deno.test("all candidates exhausted returns null so the generic path runs", async () => {
  const calls: string[] = [];
  const result = await runAdapters(
    [adapter("a", "fail", calls), adapter("b", "empty", calls), adapter("c", "throw", calls)],
    "https://example.com/events",
    "events",
  );
  assert(result === null, "null means fall through to the generic scraper");
  assert(calls.length === 3, `every candidate attempted, calls: ${calls}`);
});

Deno.test("adapters that do not match or do not support the category are not called", async () => {
  const calls: string[] = [];
  const nonMatching: DomainAdapter = {
    ...adapter("other-host", "items", calls),
    matches: () => false,
  };
  const wrongCategory: DomainAdapter = {
    ...adapter("restaurants-only", "items", calls),
    supports: (c) => c === "restaurants",
  };
  const result = await runAdapters(
    [nonMatching, wrongCategory],
    "https://example.com/events",
    "events",
  );
  assert(result === null, "no candidates → null");
  assert(calls.length === 0, `nothing fetched, calls: ${calls}`);
});
