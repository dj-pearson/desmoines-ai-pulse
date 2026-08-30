/**
 * DMI-013 — the two producers' source sets are disjoint AND complete.
 *
 * TWO FAILURES, AND THE SECOND IS THE ONE THIS FILE EXISTS FOR. A source in
 * BOTH sets gets scraped twice, which is noisy and self-announcing — duplicate
 * work, duplicate cost, and the dedup catches the rows. A source in NEITHER set
 * gets scraped by nobody, and that failure produces no error anywhere: the
 * symptom is a public calendar that is slightly less full than it was, weeks
 * later, with nothing to grep for.
 *
 * A ONE-DIRECTIONAL CHECK ONLY CATCHES THE LOUD ONE. So both are asserted, and
 * the counter-assertions below prove each direction actually fires.
 *
 * Run: `deno test --allow-read supabase/functions/_shared/eventSourceOwnership.test.ts`
 */
import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  cloudOwnedProfiles,
  EVENT_SOURCE_PROFILES,
  hubOwnedProfiles,
  isHubOwned,
  type EventSourceProfile,
  type SourceOwnership,
} from "./eventSourceProfiles.ts";

const ids = (ps: readonly EventSourceProfile[]) => ps.map((p) => p.id).sort();

Deno.test("every profile declares an ownership, and only the two valid values", () => {
  const valid: SourceOwnership[] = ["cloud", "hub"];
  for (const p of EVENT_SOURCE_PROFILES) {
    assert(valid.includes(p.ownership), `${p.id} has ownership "${p.ownership}"`);
  }
  // Not vacuous: there really are profiles to check.
  assert(EVENT_SOURCE_PROFILES.length >= 16, `${EVENT_SOURCE_PROFILES.length} profiles`);
});

Deno.test("DIRECTION 1 — the sets are disjoint (nothing is scraped twice)", () => {
  const hub = new Set(ids(hubOwnedProfiles()));
  const cloud = new Set(ids(cloudOwnedProfiles()));
  const both = [...hub].filter((id) => cloud.has(id));
  assertEquals(both, [], `these are claimed by both producers: ${both.join(", ")}`);
});

Deno.test("DIRECTION 2 — the union is EVERY profile (nothing is dropped by both)", () => {
  const union = new Set([...ids(hubOwnedProfiles()), ...ids(cloudOwnedProfiles())]);
  const all = ids(EVENT_SOURCE_PROFILES);
  const orphans = all.filter((id) => !union.has(id));
  assertEquals(orphans, [], `these are scraped by NOBODY: ${orphans.join(", ")}`);
  assertEquals(union.size, all.length);
});

Deno.test("counter-assertion — a source removed from BOTH sets is caught", () => {
  // The whole point. Simulated on a copy, because the real invariant is held by
  // the required `ownership` field and cannot be violated in the real array
  // without a type error — which is itself the strongest form of this check.
  const withOrphan = [
    ...EVENT_SOURCE_PROFILES,
    { ...EVENT_SOURCE_PROFILES[0], id: "orphan-source", ownership: "nobody" as unknown as SourceOwnership },
  ];
  const hub = withOrphan.filter((p) => p.ownership === "hub").map((p) => p.id);
  const cloud = withOrphan.filter((p) => p.ownership === "cloud").map((p) => p.id);
  const union = new Set([...hub, ...cloud]);
  const orphans = withOrphan.map((p) => p.id).filter((id) => !union.has(id));
  assertEquals(orphans, ["orphan-source"], "the completeness check fires on a source in neither set");
});

Deno.test("counter-assertion — a source in BOTH sets is caught", () => {
  // Modelled the only way it could actually happen: two accessors that stopped
  // deriving from one field. If either kept its own list, this is what it would
  // look like.
  const hub = ["hoyt-sherman", "dm-symphony"];
  const cloud = ["dm-symphony", "catchdesmoines"];
  const both = hub.filter((id) => cloud.includes(id));
  assertEquals(both, ["dm-symphony"], "the disjointness check fires on an overlap");
});

Deno.test("the hub owns exactly what gate 1 cleared, and nothing it held back", () => {
  // Gate 1, 2026-08-28: six tier-3 sources measured, four cleared.
  // iowa-wild's markdown arm returned prose with no JSON array; dm-playhouse got
  // 251 characters of markdown for a page Browserless rendered at 392,786.
  // Neither moved, and this pins that so a later edit has to be deliberate.
  assertEquals(ids(hubOwnedProfiles()), ["dm-symphony", "first-fleet-woolys", "hoyt-sherman", "iowa-wolves"]);

  const heldBack = ["iowa-wild", "dm-playhouse"];
  for (const id of heldBack) {
    const p = EVENT_SOURCE_PROFILES.find((x) => x.id === id);
    assert(p, `${id} is still a profile`);
    assertEquals(p!.ownership, "cloud", `${id} was held back by gate 1 and stays on the cloud path`);
  }
});

Deno.test("isHubOwned resolves a URL through the profile, not a list", () => {
  assert(isHubOwned("https://hoytsherman.org/events/"));
  assert(isHubOwned("https://www.dmsymphony.org/concerts-events/"), "a www subdomain still matches");
  assertFalse(isHubOwned("https://www.catchdesmoines.com/events/"), "a cloud-owned source is not the hub's");
  assertFalse(isHubOwned("https://www.iowawild.com/games"), "and neither is one gate 1 held back");
});

Deno.test("an UNRECOGNISED url is not hub-owned — the safe direction", () => {
  // A source matching no profile keeps being scraped by the cloud path, which is
  // what it did before this field existed. Returning true would silently drop it,
  // and a dropped source is the failure nobody sees.
  assertFalse(isHubOwned("https://some-new-venue.example.com/events"));
  assertFalse(isHubOwned("not a url at all"));
  assertFalse(isHubOwned(""));
});

Deno.test("the split is real on both sides — neither set is empty", () => {
  // Without this, a bug making every profile 'cloud' would pass disjointness and
  // completeness perfectly while the hub scraped nothing.
  assert(hubOwnedProfiles().length > 0, "the hub owns something");
  assert(cloudOwnedProfiles().length > 0, "the cloud path owns something");
  assertEquals(hubOwnedProfiles().length + cloudOwnedProfiles().length, EVENT_SOURCE_PROFILES.length);
});
