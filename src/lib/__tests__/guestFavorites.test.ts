import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GUEST_FAVORITE_CAP, stashedFavorite } from "@/lib/guestFavorites";

describe("GUEST_FAVORITE_CAP", () => {
  it("sits below the free plan's favorites limit", () => {
    // The client's free-plan fallback. The server reads subscription_plans,
    // seeded to the same 3 by 20260316000001; if either moves, the cap has to
    // stay below it or signing up stops being worth anything.
    const src = readFileSync(resolve(__dirname, "../../hooks/useSubscription.ts"), "utf8");
    const match = src.match(/const FREE_LIMITS[^{]*\{\s*favorites:\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(GUEST_FAVORITE_CAP).toBeLessThan(Number(match![1]));
  });
});

describe("stashedFavorite", () => {
  it("reads the payload FavoriteButton stashes", () => {
    expect(stashedFavorite({ type: "restaurant", id: "r1" })).toMatchObject({
      type: "restaurant",
      id: "r1",
    });
  });

  it("refuses anything else", () => {
    expect(stashedFavorite(null)).toBeNull();
    expect(stashedFavorite("event")).toBeNull();
    expect(stashedFavorite({ type: "event" })).toBeNull();
    expect(stashedFavorite({ type: "event", id: "" })).toBeNull();
    expect(stashedFavorite({ type: "profile", id: "x" })).toBeNull();
  });
});
