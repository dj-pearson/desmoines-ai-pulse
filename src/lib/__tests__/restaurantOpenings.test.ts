import { describe, it, expect } from "vitest";
import { groupOpenings } from "@/lib/restaurantOpenings";

const NOW = new Date("2026-09-23T12:00:00Z");
const r = (id: string, status: string | null, opening_date: string | null = null) => ({ id, name: id, status, opening_date });

describe("groupOpenings", () => {
  it("puts newly_opened and recently dated places under recent, newest first", () => {
    const { recent } = groupOpenings(
      [r("a", "newly_opened", "2026-03-01"), r("b", "open", "2026-08-01"), r("c", "newly_opened")],
      NOW,
    );
    expect(recent.map((x) => x.id)).toEqual(["b", "a", "c"]);
  });

  it("puts opening_soon and announced under upcoming, soonest first", () => {
    const { upcoming } = groupOpenings(
      [r("x", "announced"), r("y", "opening_soon", "2026-12-01"), r("z", "opening_soon", "2026-10-15")],
      NOW,
    );
    expect(upcoming.map((x) => x.id)).toEqual(["z", "y", "x"]);
  });

  it("leaves out closed places, and open places that opened over a year ago", () => {
    const out = groupOpenings([r("old", "open", "2024-01-01"), r("gone", "closed", "2026-09-01")], NOW);
    expect(out.recent).toEqual([]);
    expect(out.upcoming).toEqual([]);
  });

  it("does not count a future opening_date on an open place as recent", () => {
    expect(groupOpenings([r("f", "open", "2027-01-01")], NOW).recent).toEqual([]);
  });
});
