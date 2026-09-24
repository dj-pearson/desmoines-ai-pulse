/**
 * "After dinner, nearby tonight" row selection (restaurants plan WP8 item 6),
 * against a fixed clock: 2026-09-24 17:00 CDT.
 */
import { describe, it, expect } from "vitest";
import { pickTonightNear, WALKABLE_MILES } from "../useTonightNearRestaurant";
import type { TonightEvent } from "@/lib/tonightPairings";

const NOW = new Date("2026-09-24T22:00:00Z");
const ORIGIN = { latitude: 41.585, longitude: -93.625 };

/** An event `miles` due north of ORIGIN. */
function ev(id: string, startUtc: string, miles: number, extra: Partial<TonightEvent> = {}): TonightEvent {
  return {
    id,
    title: `Event ${id}`,
    date: startUtc,
    event_start_utc: startUtc,
    venue: `Venue ${id}`,
    latitude: ORIGIN.latitude + miles / 69,
    longitude: ORIGIN.longitude,
    ...extra,
  };
}

describe("pickTonightNear", () => {
  it("keeps tonight's events inside the pairing radius, in start order", () => {
    const rows = [
      ev("late", "2026-09-25T02:00:00Z", 0.5), // 9:00 PM CT
      ev("show", "2026-09-25T00:30:00Z", 0.3), // 7:30 PM CT
      ev("far", "2026-09-25T01:00:00Z", 3), // outside 1.5 mi
      ev("started", "2026-09-24T20:00:00Z", 0.2), // 3:00 PM CT, already begun
      ev("tomorrow", "2026-09-25T15:00:00Z", 0.2), // 10:00 AM CT tomorrow
    ];
    const picked = pickTonightNear(rows, ORIGIN, NOW);
    expect(picked.map((p) => p.event.id)).toEqual(["show", "late"]);
    expect(picked[0].startsAt?.toISOString()).toBe("2026-09-25T00:30:00.000Z");
  });

  it("marks rows under the walkable threshold", () => {
    const picked = pickTonightNear(
      [ev("near", "2026-09-25T00:30:00Z", 0.4), ev("drive", "2026-09-25T01:30:00Z", 1.2)],
      ORIGIN,
      NOW,
    );
    expect(WALKABLE_MILES).toBe(0.75);
    expect(picked.map((p) => [p.event.id, p.walkable])).toEqual([
      ["near", true],
      ["drive", false],
    ]);
  });

  it("drops events with no usable coordinates", () => {
    const picked = pickTonightNear(
      [
        ev("nowhere", "2026-09-25T00:30:00Z", 0, { latitude: null, longitude: null }),
        ev("null-island", "2026-09-25T00:30:00Z", 0, { latitude: 0, longitude: 0 }),
      ],
      ORIGIN,
      NOW,
    );
    expect(picked).toEqual([]);
  });

  it("caps the list", () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      ev(`e${i}`, `2026-09-25T0${i}:00:00Z`, 0.1),
    );
    expect(pickTonightNear(rows, ORIGIN, NOW, 3)).toHaveLength(3);
  });
});
