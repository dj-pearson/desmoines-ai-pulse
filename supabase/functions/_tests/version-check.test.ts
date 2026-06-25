/**
 * version-check / minimum-supported-version logic (IOS-AUDIT-REL-001).
 *
 * Run with:
 *   deno test --allow-none supabase/functions/_tests/version-check.test.ts
 *
 * Covers the pure version-comparison logic that decides force-upgrade and
 * optional-update, including the below-minimum and at-minimum branches called
 * out in the acceptance criteria.
 */

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  compareVersions,
  isBelowMinimum,
  isUpdateAvailable,
  MIN_SUPPORTED_APP_VERSION,
  LATEST_APP_VERSION,
} from "../_shared/minSupportedVersions.ts";

Deno.test("compareVersions orders numerically, not lexically", () => {
  assert(compareVersions("1.2.0", "1.10.0") < 0); // 2 < 10 numerically
  assert(compareVersions("2.0.0", "1.9.9") > 0);
  assertEquals(compareVersions("1.2.0", "1.2.0"), 0);
  assertEquals(compareVersions("1.2", "1.2.0"), 0); // tolerant of segment count
});

Deno.test("compareVersions never throws on malformed input", () => {
  assertEquals(compareVersions("", ""), 0);
  assert(compareVersions("garbage", "1.0.0") < 0); // junk sorts as 0.0.0
});

Deno.test("below-minimum branch forces upgrade", () => {
  const floor = MIN_SUPPORTED_APP_VERSION.ios;
  // A version one patch below the floor must force upgrade.
  const parts = floor.split(".").map((n) => parseInt(n, 10) || 0);
  const belowFloor = `${parts[0]}.${parts[1]}.${Math.max(0, parts[2] - 1)}`;
  if (compareVersions(belowFloor, floor) < 0) {
    assert(isBelowMinimum("ios", belowFloor));
  }
  // "0.0.1" is below any real floor.
  assert(isBelowMinimum("ios", "0.0.1"));
});

Deno.test("at-minimum and above are not forced", () => {
  assert(!isBelowMinimum("ios", MIN_SUPPORTED_APP_VERSION.ios));
  assert(!isBelowMinimum("ios", "999.0.0"));
  assert(!isBelowMinimum("android", MIN_SUPPORTED_APP_VERSION.android));
});

Deno.test("update-available is true below latest, false at latest", () => {
  assert(!isUpdateAvailable("ios", LATEST_APP_VERSION.ios));
  assert(isUpdateAvailable("ios", "0.0.1"));
});
