import { describe, it, expect } from "vitest";
import { isActivelySponsored, arrangeSponsoredFirst } from "@/lib/sponsored";

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

describe("isActivelySponsored (WEB-FEAT-005)", () => {
  it("requires is_sponsored", () => {
    expect(isActivelySponsored({ is_sponsored: false })).toBe(false);
    expect(isActivelySponsored({})).toBe(false);
    expect(isActivelySponsored(null)).toBe(false);
  });
  it("true with no expiry, or a future expiry", () => {
    expect(isActivelySponsored({ is_sponsored: true })).toBe(true);
    expect(isActivelySponsored({ is_sponsored: true, sponsored_until: future })).toBe(true);
  });
  it("expired sponsorships drop the treatment", () => {
    expect(isActivelySponsored({ is_sponsored: true, sponsored_until: past })).toBe(false);
  });
});

describe("arrangeSponsoredFirst (WEB-FEAT-005)", () => {
  it("boosts up to `cap` active-sponsored to the front, preserving organic order", () => {
    const items = [
      { id: "a" },
      { id: "b", is_sponsored: true },
      { id: "c" },
      { id: "d", is_sponsored: true, sponsored_until: future },
      { id: "e", is_sponsored: true }, // 3rd sponsored — past cap, stays organic
      { id: "f" },
    ];
    const out = arrangeSponsoredFirst(items, 2).map((i) => i.id);
    expect(out.slice(0, 2)).toEqual(["b", "d"]); // first 2 sponsored at top
    expect(out).toEqual(["b", "d", "a", "c", "e", "f"]); // organic order kept after
  });

  it("ignores expired sponsorships and returns input when none active", () => {
    const items = [{ id: "a" }, { id: "b", is_sponsored: true, sponsored_until: past }];
    expect(arrangeSponsoredFirst(items).map((i) => i.id)).toEqual(["a", "b"]);
  });
});
