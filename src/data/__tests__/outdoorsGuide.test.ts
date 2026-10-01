import { describe, it, expect } from "vitest";
import {
  OUTDOORS_DESTINATIONS,
  destinationForTrailSlug,
  logisticsDate,
} from "@/data/outdoorsGuide";

/**
 * Explore plan WP6 item 3, pass 2 WP5 item 9: every destination in the
 * /outdoors guide dates its logistics, and the date shown is allowed to go
 * stale for a year at most. Parking lots move, fees appear and roads close for
 * a season; a date nobody revisits turns into a claim the page can't back.
 *
 * The date shown is `checkedOn` when someone has re-checked the facts, else
 * `writtenOn`. The 365-day limit applies to whichever one the page prints.
 *
 * The clock is the real one on purpose. A fixed clock would keep this passing
 * forever, which is the failure the test exists to catch.
 */

const MAX_AGE_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  // Round-trips, so "2026-02-30" can't slip through as March 2.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

describe("outdoors guide dates", () => {
  it("has eight destinations", () => {
    expect(OUTDOORS_DESTINATIONS).toHaveLength(8);
  });

  it.each(OUTDOORS_DESTINATIONS.map((d) => [d.id, d.logistics.writtenOn, d.logistics.checkedOn]))(
    "%s has a valid writtenOn and, if set, a valid checkedOn no earlier than it",
    (_id, writtenOn, checkedOn) => {
      expect(isValidIsoDate(writtenOn as string)).toBe(true);
      if (checkedOn !== undefined) {
        expect(isValidIsoDate(checkedOn as string)).toBe(true);
        expect((checkedOn as string) >= (writtenOn as string)).toBe(true);
      }
    },
  );

  it.each(OUTDOORS_DESTINATIONS.map((d) => [d.id, logisticsDate(d.logistics).iso]))(
    "%s shows a date within the last year and not in the future",
    (_id, shown) => {
      const ageDays = (Date.now() - Date.parse(`${shown}T00:00:00Z`)) / DAY_MS;
      expect(ageDays).toBeGreaterThan(-1);
      expect(ageDays).toBeLessThanOrEqual(MAX_AGE_DAYS);
    },
  );
});

describe("logisticsDate", () => {
  it("says Written until someone sets checkedOn", () => {
    expect(logisticsDate({ writtenOn: "2026-08-31" })).toEqual({ kind: "Written", iso: "2026-08-31" });
    expect(logisticsDate({ writtenOn: "2026-08-31", checkedOn: "2026-09-20" })).toEqual({
      kind: "Checked",
      iso: "2026-09-20",
    });
  });
});

describe("destinationForTrailSlug", () => {
  it("finds the guide entry whose own page is the trail page", () => {
    expect(destinationForTrailSlug("high-trestle-trail")?.id).toBe(
      OUTDOORS_DESTINATIONS.find((d) => d.internalPath === "/outdoors/high-trestle-trail")?.id,
    );
  });

  it("returns nothing for a trail that is not a guide destination", () => {
    expect(destinationForTrailSlug("fixture-trail-1")).toBeUndefined();
    expect(destinationForTrailSlug("")).toBeUndefined();
  });
});
