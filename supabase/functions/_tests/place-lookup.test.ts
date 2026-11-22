// Run with:
//   deno test --allow-read supabase/functions/_tests/place-lookup.test.ts
//
// WEB-BE-064: the name-and-address match that may attach a Google place id to
// a listing, and the 404 path that turns a vanished place id into a finding.

import { strict as assert } from "node:assert";
import {
  buildClosureReview,
  normalizePlaceName,
  type PlaceCandidate,
  pickConfidentPlace,
  placeLookupQuery,
  streetNumber,
} from "../_shared/placeLookup.ts";

const c = (id: string, name: string, address: string): PlaceCandidate => ({
  id,
  displayName: { text: name },
  formattedAddress: address,
});

Deno.test("normalizePlaceName ignores case, accents, punctuation, the, restaurant and &", () => {
  assert.equal(normalizePlaceName("The Cheese Shop & Cafe"), "cheese shop cafe");
  assert.equal(normalizePlaceName("Cheese Shop and Cafe"), "cheese shop cafe");
  assert.equal(normalizePlaceName("Café Diem Restaurant"), "cafe diem");
  assert.equal(normalizePlaceName("Zombie Burger + Drink Lab"), "zombie burger drink lab");
  // Bar and Grill are kept: they can be the only difference between two places.
  assert.notEqual(normalizePlaceName("Fong's Pizza"), normalizePlaceName("Fong's Pizza Bar"));
});

Deno.test("streetNumber reads the leading number only", () => {
  assert.equal(streetNumber("223 4th St, Des Moines, IA"), "223");
  assert.equal(streetNumber("Des Moines, IA"), null);
  assert.equal(streetNumber(null), null);
});

Deno.test("a single candidate with the same name and street number matches", () => {
  const m = pickConfidentPlace(
    { id: "r1", name: "Fong's Pizza", location: "223 4th St, Des Moines, IA 50309" },
    [c("p1", "Fong's Pizza", "223 4th St, Des Moines, IA 50309, USA"), c("p2", "Fongs Noodle", "1 Main St, Ames, IA")],
  );
  assert.deepEqual(m, { ok: true, placeId: "p1" });
});

Deno.test("a name that only resembles the listing is refused", () => {
  const m = pickConfidentPlace(
    { id: "r1", name: "Fong's Pizza", location: "223 4th St, Des Moines, IA" },
    [c("p1", "Fong's Pizza Bar", "223 4th St, Des Moines, IA 50309, USA")],
  );
  assert.deepEqual(m, { ok: false, reason: "no_name_match" });
});

Deno.test("the right name at a different street number is refused", () => {
  const m = pickConfidentPlace(
    { id: "r1", name: "Taco John's", location: "1200 E Euclid Ave, Des Moines, IA" },
    [c("p1", "Taco John's", "4101 Merle Hay Rd, Des Moines, IA 50310, USA")],
  );
  assert.deepEqual(m, { ok: false, reason: "address_mismatch" });
});

Deno.test("a match outside Iowa is refused", () => {
  const m = pickConfidentPlace({ id: "r1", name: "Hessen Haus", location: null }, [
    c("p1", "Hessen Haus", "101 Main St, Omaha, NE 68102, USA"),
  ]);
  assert.deepEqual(m, { ok: false, reason: "address_mismatch" });
});

Deno.test("two branches that both pass are refused as ambiguous", () => {
  const m = pickConfidentPlace({ id: "r1", name: "Hy-Vee Market Grille", location: "Des Moines, IA" }, [
    c("p1", "Hy-Vee Market Grille", "4605 Fleur Dr, Des Moines, IA 50321, USA"),
    c("p2", "Hy-Vee Market Grille", "3221 SE 14th St, Des Moines, IA 50320, USA"),
  ]);
  assert.deepEqual(m, { ok: false, reason: "ambiguous" });
});

Deno.test("no candidates is its own reason", () => {
  assert.deepEqual(pickConfidentPlace({ id: "r1", name: "X" }, []), { ok: false, reason: "no_candidates" });
});

Deno.test("the query falls back to Des Moines when the row has no address", () => {
  assert.equal(placeLookupQuery({ id: "r", name: "Proof", location: "" }), "Proof, Des Moines, IA");
  assert.equal(placeLookupQuery({ id: "r", name: "Proof", location: "1301 Locust St" }), "Proof, 1301 Locust St");
});

Deno.test("buildClosureReview carries the restaurant, reason, source and details", () => {
  assert.deepEqual(buildClosureReview("r1", "place_not_found", "job", { google_place_id: "abc" }), {
    restaurant_id: "r1",
    reason: "place_not_found",
    source: "job",
    details: { google_place_id: "abc" },
  });
});

Deno.test("a Places 404 in the refresh queues a finding and holds the row out of promotion", async () => {
  const src = await Deno.readTextFile(new URL("../bulk-update-restaurants/index.ts", import.meta.url));
  const fn = src.slice(src.indexOf("async function refreshStaleHours"), src.indexOf("async function queueClosureReview"));
  const branch = fn.slice(fn.indexOf("failedLookupCountsAsCheck(res.status)"), fn.indexOf("} else {", fn.indexOf("failedLookupCountsAsCheck(res.status)")));
  assert.ok(branch.includes("promotion_hold_reason: 'place_not_found'"), "404 must hold the row");
  assert.ok(branch.includes("buildClosureReview(row.id, 'place_not_found'"), "404 must queue a review");
  assert.ok(/if \(queued !== null\)[\s\S]*?continue/.test(branch), "a failed queue insert must not stamp the row");
});

Deno.test("the lookup stores a place id only on a confident match and stamps every answered row", async () => {
  const src = await Deno.readTextFile(new URL("../bulk-update-restaurants/index.ts", import.meta.url));
  const fn = src.slice(src.indexOf("async function lookupMissingPlaceIds"), src.indexOf("serve(async"));
  assert.ok(fn.includes("pickConfidentPlace(row, candidates)"));
  assert.ok(fn.includes(".is('google_place_id', null)"));
  assert.ok(fn.includes("Math.min(batchSize, PLACE_LOOKUP_DAILY_MAX)"), "lookup batch must be capped");
  assert.ok(/if \(match\.ok && reason === null\)[\s\S]*?google_place_id: match\.placeId/.test(fn));
  assert.ok(fn.includes("'no_place_match'"));
  assert.ok(/order\('place_lookup_checked_at', \{ ascending: true, nullsFirst: true \}\)/.test(fn));
  // A Places error is not an answer: no stamp, retried next run.
  assert.ok(/if \(!res\.ok\) \{[\s\S]*?continue/.test(fn));
});
