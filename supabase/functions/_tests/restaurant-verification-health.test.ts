// Run with:
//   deno test --allow-read supabase/functions/_tests/restaurant-verification-health.test.ts
//
// WEB-AUTO-019: when the nightly check alerts, and that a failed count is a
// failure rather than a zero.

import { strict as assert } from "node:assert";
import {
  DEFAULT_MAX_UNVERIFIED_SHARE,
  evaluateVerificationHealth,
  parseMaxUnverifiedShare,
  posterSkipStreak,
} from "../_shared/restaurantVerificationHealth.ts";

const healthy = { total: 600, verifiedWithin30Days: 560, unverifiedOver45Days: 20, neverChecked: 10, openReviewsOver14Days: 0 };

Deno.test("a healthy table raises nothing", () => {
  assert.deepEqual(evaluateVerificationHealth(healthy, 0.25, false), []);
});

Deno.test("unverified plus never-checked over the share alerts", () => {
  const alerts = evaluateVerificationHealth({ ...healthy, unverifiedOver45Days: 100, neverChecked: 60 }, 0.25, false);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /160 of 600 restaurants \(27%\)/);
});

Deno.test("exactly at the share does not alert", () => {
  assert.deepEqual(evaluateVerificationHealth({ ...healthy, unverifiedOver45Days: 150, neverChecked: 0 }, 0.25, false), []);
});

Deno.test("three skipped poster runs alert; two do not", () => {
  const skip = { metadata: { outcomes: { restaurant: { skipped: "no_eligible_restaurant" } } } };
  const posted = { metadata: { outcomes: { restaurant: { ok: true } } } };
  assert.equal(posterSkipStreak([skip, skip, skip]), true);
  assert.equal(posterSkipStreak([skip, skip]), false);
  assert.equal(posterSkipStreak([skip, skip, posted]), false);
  assert.equal(posterSkipStreak([skip, { metadata: { outcomes: { restaurant: { skipped: "paused" } } } }, skip]), false);
  assert.equal(evaluateVerificationHealth(healthy, 0.25, true).length, 1);
});

Deno.test("old open closure reviews are reported", () => {
  assert.match(evaluateVerificationHealth({ ...healthy, openReviewsOver14Days: 2 }, 0.25, false)[0], /2 closure review/);
});

Deno.test("the share setting is clamped to a usable value", () => {
  assert.equal(parseMaxUnverifiedShare(0.4), 0.4);
  for (const bad of [undefined, null, "x", 0, -1, 2]) {
    assert.equal(parseMaxUnverifiedShare(bad), DEFAULT_MAX_UNVERIFIED_SHARE, String(bad));
  }
});

Deno.test("every count throws on a failed read instead of reporting zero", async () => {
  const src = await Deno.readTextFile(new URL("../restaurant-verification-health/index.ts", import.meta.url));
  assert.ok(/if \(error \|\| typeof n !== "number"\) \{\s*throw/.test(src), "restaurant counts must throw");
  assert.ok(/if \(reviewsError \|\| typeof reviews !== "number"\) \{\s*throw/.test(src), "review count must throw");
  assert.ok(src.includes("runJob(JOB"), "the run is recorded in automation_job_runs");
});
