import { describe, expect, it } from "vitest";
import { describeFieldLock, parseFieldLocks } from "@/lib/restaurantFieldLocks";

describe("parseFieldLocks", () => {
  it("reads the stored map", () => {
    expect(
      parseFieldLocks({ phone: { by: "owner", at: "2026-11-20T12:00:00Z" }, cuisine: { by: "admin", at: "x" } }),
    ).toEqual({
      phone: { by: "owner", at: "2026-11-20T12:00:00Z" },
      cuisine: { by: "admin", at: "x" },
    });
  });

  it("treats null and malformed values as no locks", () => {
    for (const raw of [null, undefined, "phone", ["phone"], 3]) expect(parseFieldLocks(raw)).toEqual({});
  });

  it("keeps a lock with odd provenance rather than hiding it", () => {
    expect(parseFieldLocks({ phone: true })).toEqual({ phone: { by: "unknown", at: null } });
  });
});

describe("describeFieldLock", () => {
  it("names who set it and when", () => {
    expect(describeFieldLock({ by: "owner", at: "2026-11-20T12:00:00Z" })).toBe(
      "Set by the owner on Nov 20, 2026. Google enrichment leaves it alone.",
    );
    expect(describeFieldLock({ by: "admin", at: null })).toBe("Set by an admin. Google enrichment leaves it alone.");
    expect(describeFieldLock({ by: "unknown", at: "not a date" })).toBe(
      "Set by a person. Google enrichment leaves it alone.",
    );
  });
});
