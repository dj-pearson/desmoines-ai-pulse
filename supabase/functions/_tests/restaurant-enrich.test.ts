// Run with:
//   deno test --allow-read supabase/functions/_tests/restaurant-enrich.test.ts
//
// WEB-BE-066: the daily auto-enrich job posted the ids of the incomplete rows
// it picked and bulk-update-restaurants ignored them, re-enriching whatever an
// unordered select returned; the select left out description, so a place with
// no Google editorial summary lost its description; and a name-only search
// took places[0] whatever its name. Pins the id filter, the description rule
// and the name match, in the pure rules and in the function that uses them.

import { strict as assert } from "node:assert";
import {
  applyEnrichTargets,
  descriptionUpdate,
  ENRICH_SELECT,
  type EnrichQuery,
  enrichDueFilter,
  enrichRetryCutoff,
  parseCursor,
  parseRestaurantIds,
  pickNamedSearchHit,
} from "../_shared/restaurantEnrich.ts";

const BULK = new URL("../bulk-update-restaurants/index.ts", import.meta.url);
const AUTO = new URL("../auto-enrich-restaurants/index.ts", import.meta.url);
const MIGRATION = new URL(
  "../../migrations/20261121000030_restaurant_enrich_checked_at.sql",
  import.meta.url,
);

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

/** Records the calls applyEnrichTargets makes. */
class Recorder implements EnrichQuery<Recorder> {
  calls: Array<[string, ...unknown[]]> = [];
  in(column: string, values: string[]) { this.calls.push(["in", column, values]); return this; }
  or(filter: string) { this.calls.push(["or", filter]); return this; }
  gt(column: string, value: string) { this.calls.push(["gt", column, value]); return this; }
  order(column: string, options: { ascending: boolean }) { this.calls.push(["order", column, options]); return this; }
  limit(count: number) { this.calls.push(["limit", count]); return this; }
  names() { return this.calls.map((c) => c[0]); }
}

// ---------------------------------------------------------------- id filter

Deno.test("parseRestaurantIds keeps uuids, drops junk and duplicates, null when absent", () => {
  assert.deepEqual(parseRestaurantIds([A, B, A, "nope", 7, null]), [A, B]);
  assert.equal(parseRestaurantIds(undefined), null);
  assert.equal(parseRestaurantIds(null), null);
  assert.equal(parseRestaurantIds([]), null);
  assert.equal(parseRestaurantIds("not-an-array"), null);
  const many = Array.from({ length: 80 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  assert.equal(parseRestaurantIds(many)?.length, 50);
});

Deno.test("with ids, the selection is exactly those rows, and a cursor is ignored", () => {
  const q = applyEnrichTargets(new Recorder(), { restaurantIds: [A, B], forceUpdate: true, afterId: A, batchSize: 20 });
  assert.deepEqual(q.calls[0], ["in", "id", [A, B]]);
  assert.ok(!q.names().includes("gt"));
  assert.ok(!q.names().includes("or"), "force mode does not filter on enhanced");
});

Deno.test("force mode without ids walks in id order after the cursor", () => {
  const q = applyEnrichTargets(new Recorder(), { restaurantIds: null, forceUpdate: true, afterId: A, batchSize: 5 });
  assert.deepEqual(q.calls, [
    ["gt", "id", A],
    ["order", "id", { ascending: true }],
    ["limit", 5],
  ]);
  const first = applyEnrichTargets(new Recorder(), { restaurantIds: null, forceUpdate: true, afterId: null, batchSize: 5 });
  assert.ok(first.names().includes("order"), "the first run is ordered too, so lastId is a real cursor");
  assert.ok(!first.names().includes("in"));
});

Deno.test("without force, rows already enhanced are still skipped (old behaviour)", () => {
  const q = applyEnrichTargets(new Recorder(), { restaurantIds: null, forceUpdate: false, afterId: null, batchSize: 10 });
  assert.ok(q.calls.some((c) => c[0] === "or" && c[1] === "enhanced.is.null,enhanced.neq.completed"));
  const ids = applyEnrichTargets(new Recorder(), { restaurantIds: [A], forceUpdate: false, afterId: null, batchSize: 10 });
  assert.ok(ids.names().includes("in") && ids.names().includes("or"));
});

Deno.test("parseCursor accepts a uuid only", () => {
  assert.equal(parseCursor(A), A);
  assert.equal(parseCursor("x"), null);
  assert.equal(parseCursor(null), null);
});

Deno.test("bulk-update-restaurants reads restaurantIds and selects through applyEnrichTargets", async () => {
  const src = await Deno.readTextFile(BULK);
  assert.match(src, /restaurantIds:\s*rawRestaurantIds/, "restaurantIds must be read from the body");
  assert.match(src, /parseRestaurantIds\(rawRestaurantIds\)/);
  assert.match(src, /applyEnrichTargets\(\s*supabase\.from\('restaurants'\)\.select\(ENRICH_SELECT\)/);
  assert.match(src, /lastId: restaurants\[restaurants\.length - 1\]\.id/, "the response returns the cursor");
  assert.ok(
    !src.includes(".select('id, name, location, google_place_id, enhanced')"),
    "the old select without description is back",
  );
});

Deno.test("auto-enrich-restaurants still posts the ids it picked, and skips recently stamped rows", async () => {
  const src = await Deno.readTextFile(AUTO);
  assert.match(src, /body:\s*{\s*restaurantIds,/);
  assert.match(src, /enrichDueFilter\(enrichRetryCutoff\(\)\)/);
  assert.match(src, /isUnknownColumnError\(fetchError\)/, "falls back when the column is not there yet");
});

// ---------------------------------------------------------- description rule

Deno.test("the enrichment select includes description", () => {
  assert.ok(ENRICH_SELECT.split(",").map((s) => s.trim()).includes("description"));
});

Deno.test("a stored description is never replaced with null", () => {
  assert.deepEqual(descriptionUpdate("A neighbourhood taqueria since 1998.", undefined), {});
  assert.deepEqual(descriptionUpdate("A neighbourhood taqueria since 1998.", ""), {});
  assert.deepEqual(descriptionUpdate("A neighbourhood taqueria since 1998.", "   "), {});
  assert.deepEqual(descriptionUpdate("Discovered via Google Places API", null), {});
  assert.deepEqual(descriptionUpdate(null, undefined), {});
  for (const current of ["x", "", null, undefined]) {
    const out = descriptionUpdate(current, undefined);
    assert.ok(!("description" in out), `no description key for ${String(current)}`);
  }
});

Deno.test("Google's editorial summary replaces the description when it has one", () => {
  assert.deepEqual(descriptionUpdate("old", "Wood-fired pizza in the East Village."), {
    description: "Wood-fired pizza in the East Village.",
  });
  assert.deepEqual(descriptionUpdate(null, " Tacos. "), { description: "Tacos." });
  assert.deepEqual(descriptionUpdate("Tacos.", "Tacos."), {}, "an unchanged summary is not rewritten");
});

Deno.test("bulk-update-restaurants writes description only through descriptionUpdate", async () => {
  const src = await Deno.readTextFile(BULK);
  assert.ok(!/description\s*=\s*null/.test(src), "description is assigned null again");
  assert.ok(!/description:\s*null/.test(src), "description is assigned null again");
  assert.match(src, /descriptionUpdate\(restaurant\.description, placeDetails\.editorialSummary\?\.text\)/);
});

// ---------------------------------------------------------------- name match

const hit = (id: string, name: string) => ({ id, displayName: { text: name }, formattedAddress: "Des Moines, IA" });

Deno.test("a search hit is accepted only when its name matches", () => {
  assert.equal(pickNamedSearchHit("Fong's Pizza", [hit("p1", "Pizza Hut"), hit("p2", "Fongs Pizza")])?.id, "p2");
  assert.equal(pickNamedSearchHit("The Cheese Shop & Cafe", [hit("p1", "Cheese Shop and Cafe")])?.id, "p1");
  assert.equal(pickNamedSearchHit("Fong's Pizza", [hit("p1", "Pizza Hut")]), null);
  // The old rule took the first hit sharing the first word.
  assert.equal(pickNamedSearchHit("Fong's Pizza", [hit("p1", "Fong's Pizza Bar")]), null);
  assert.equal(pickNamedSearchHit("Fong's Pizza", []), null);
  assert.equal(pickNamedSearchHit("Fong's Pizza", [{ displayName: { text: "Fong's Pizza" } }]), null, "no id, no match");
  assert.equal(pickNamedSearchHit("", [hit("p1", "")]), null);
});

Deno.test("bulk-update-restaurants matches search hits by name and counts the rest as unmatched", async () => {
  const src = await Deno.readTextFile(BULK);
  assert.match(src, /pickNamedSearchHit\(restaurant\.name, places\)/);
  assert.ok(!/searchData\.places\[0\]/.test(src), "places[0] is accepted again");
  assert.match(src, /unmatched\+\+/);
  assert.match(src, /\n\s+unmatched,\n/, "the response carries unmatched");
});

// ------------------------------------------------------- enrich_checked_at

Deno.test("enrich_checked_at: additive column, stamped by the enrichment, filtered by the daily job", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS enrich_checked_at timestamptz;/);
  assert.ok(!/\b(DROP|NOT NULL|RENAME)\b/.test(sql.replace(/--.*$/gm, "")));
  const src = await Deno.readTextFile(BULK);
  assert.match(src, /if \(googleAnswered\) update\.enrich_checked_at/);
  // Stripped on the unknown-column retry, like the other guarded columns.
  assert.match(src, /enrich_checked_at,\n\s+\.\.\.legacyUpdate/);
  const cutoff = enrichRetryCutoff(new Date("2026-11-21T00:00:00Z"), 30);
  assert.equal(cutoff, "2026-10-22T00:00:00.000Z");
  assert.equal(enrichDueFilter(cutoff), `enrich_checked_at.is.null,enrich_checked_at.lt.${cutoff}`);
});
