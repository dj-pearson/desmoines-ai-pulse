import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findUnnamedFields } from "../../../scripts/check-field-names.mjs";

/**
 * WEB-UX-068 slice 6 / WEB-UX-072. The check-field-names baseline is locked at
 * zero. The last two unnamed fields were in the event social hub, which no
 * route mounts today (WEB-QA-045 holds the wire-in-or-delete call), so they
 * are named rather than deleted. The dead files that carried the other ten
 * were deleted.
 */
const ROOT = resolve(__dirname, "../../..");

describe("event social hub fields are named", () => {
  it.each(["src/components/EventSocialHub.tsx", "src/components/EventFriendFinder.tsx"])(
    "%s",
    (file) => {
      const source = readFileSync(resolve(ROOT, file), "utf8");
      expect(findUnnamedFields(source, file)).toEqual([]);
    },
  );

  it("ties the invite message label to its textarea", () => {
    const source = readFileSync(resolve(ROOT, "src/components/EventFriendFinder.tsx"), "utf8");
    expect(source).toContain('htmlFor="invite-message"');
    expect(source).toContain('id="invite-message"');
  });
});

describe("check-field-names baseline", () => {
  it("is locked at zero", () => {
    const baseline = JSON.parse(
      readFileSync(resolve(ROOT, ".github/field-names-baseline.json"), "utf8"),
    );
    expect(baseline.total).toBe(0);
    expect(baseline.files).toEqual({});
  });
});
