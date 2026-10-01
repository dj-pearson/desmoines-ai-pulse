import { describe, expect, it } from "vitest";
import {
  MAX_DINNER_BEFORE_SHOW,
  pickDinnerBeforeShow,
  type TonightEvent,
  type TonightRestaurant,
} from "@/lib/tonightPairings";

// Thursday 2026-09-24, 15:30 CDT.
const NOW = new Date("2026-09-24T20:30:00Z");
const CIVIC = { latitude: 41.5875, longitude: -93.6235 };

// 19:30 CDT show at the Civic Center; dinner at 18:00 CDT.
const SHOW: TonightEvent = {
  id: "show",
  title: "Show",
  date: "2026-09-25T00:30:00Z",
  event_start_utc: "2026-09-25T00:30:00Z",
  ...CIVIC,
};

function r(id: string, dLat: number, extra: Partial<TonightRestaurant> = {}): TonightRestaurant {
  return {
    id,
    name: id,
    slug: id,
    opening: "Daily 11am-10pm",
    status: "active",
    latitude: CIVIC.latitude + dLat,
    longitude: CIVIC.longitude,
    ...extra,
  };
}

describe("pickDinnerBeforeShow (events plan WP8 item 6)", () => {
  it("returns up to three open restaurants within range, nearest first", () => {
    const rows = [r("c", 0.012), r("a", 0.001), r("far", 0.05), r("b", 0.005), r("d", 0.015)];
    const picks = pickDinnerBeforeShow(SHOW, rows, NOW);
    expect(picks.map((p) => p.restaurant.id)).toEqual(["a", "b", "c"]);
    expect(picks).toHaveLength(MAX_DINNER_BEFORE_SHOW);
    expect(picks[0].dinnerAt.toISOString()).toBe("2026-09-24T23:00:00.000Z");
  });

  it("skips places closed at dinner time or not serving", () => {
    const rows = [
      r("lunch", 0.001, { opening: "Daily 11am-2pm" }),
      r("shut", 0.002, { status: "temporarily_closed" }),
      r("ok", 0.003),
    ];
    expect(pickDinnerBeforeShow(SHOW, rows, NOW).map((p) => p.restaurant.id)).toEqual(["ok"]);
  });

  it("is empty for an untimed, unlocated or already-started event", () => {
    const rows = [r("a", 0.001)];
    expect(pickDinnerBeforeShow({ ...SHOW, time_tbd: true }, rows, NOW)).toEqual([]);
    expect(pickDinnerBeforeShow({ ...SHOW, latitude: null }, rows, NOW)).toEqual([]);
    expect(pickDinnerBeforeShow(SHOW, rows, new Date("2026-09-25T01:00:00Z"))).toEqual([]);
  });
});
