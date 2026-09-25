/**
 * "After dinner, nearby tonight" row selection (restaurants plan WP8 item 6),
 * against a fixed clock: 2026-09-24 17:00 CDT.
 */
import { describe, it, expect } from "vitest";
import { clockLabelMinutes, pickTonightNear, tonightHeading, WALKABLE_MILES } from "../useTonightNearRestaurant";
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

describe("clockLabelMinutes", () => {
  it("reads formatClockLabel output", () => {
    expect(clockLabelMinutes("10 PM")).toBe(22 * 60);
    expect(clockLabelMinutes("10:30 PM")).toBe(22 * 60 + 30);
    expect(clockLabelMinutes("12 AM")).toBe(0);
    expect(clockLabelMinutes("midnight")).toBe(24 * 60);
    expect(clockLabelMinutes("noon")).toBe(12 * 60);
    expect(clockLabelMinutes("tomorrow 11 AM")).toBeNull();
    expect(clockLabelMinutes(null)).toBeNull();
  });
});

describe("tonightHeading", () => {
  // NOW is 5:00 PM CDT.
  const at = (utc: string) => ({ startsAt: new Date(utc) });

  it("says after dinner when every event starts within 90 minutes of close or later", () => {
    // Closes 10 PM; 8:30 PM and 9:00 PM CT starts.
    expect(tonightHeading([at("2026-09-25T01:30:00Z"), at("2026-09-25T02:00:00Z")], "10 PM", NOW)).toBe(
      "After dinner, nearby tonight",
    );
  });

  it("stays plain when an event starts well before close", () => {
    // 6:00 PM CT start, closes 10 PM.
    expect(tonightHeading([at("2026-09-24T23:00:00Z")], "10 PM", NOW)).toBe("Tonight nearby");
  });

  it("handles a close after midnight", () => {
    // Closes 2 AM; a 9 PM CT start is well before 12:30 AM.
    expect(tonightHeading([at("2026-09-25T02:00:00Z")], "2 AM", NOW)).toBe("Tonight nearby");
    // A 1:00 AM CT start is after 12:30 AM.
    expect(tonightHeading([at("2026-09-25T06:00:00Z")], "2 AM", NOW)).toBe("After dinner, nearby tonight");
  });

  it("stays plain without a closing time or timed events", () => {
    expect(tonightHeading([at("2026-09-25T02:00:00Z")], null, NOW)).toBe("Tonight nearby");
    expect(tonightHeading([{ startsAt: null }], "10 PM", NOW)).toBe("Tonight nearby");
  });
});
