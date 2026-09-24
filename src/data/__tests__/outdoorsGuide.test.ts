import { describe, it, expect } from "vitest";
import { OUTDOORS_DESTINATIONS } from "@/data/outdoorsGuide";

/**
 * Explore plan WP6 item 3: every destination in the /outdoors guide says when
 * its logistics were last checked, and the date is allowed to go stale for a
 * year at most. Parking lots move, fees appear and roads close for a season;
 * a "checked" date that nobody revisits turns into a claim the page can't back.
 *
 * The clock is the real one on purpose. A fixed clock would keep this passing
 * forever, which is the failure the test exists to catch.
 */

const MAX_AGE_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe("outdoors guide checkedOn", () => {
  it("has eight destinations", () => {
    expect(OUTDOORS_DESTINATIONS).toHaveLength(8);
  });

  it.each(OUTDOORS_DESTINATIONS.map((d) => [d.id, d.logistics.checkedOn]))(
    "%s has a valid ISO checkedOn date",
    (_id, checkedOn) => {
      expect(checkedOn).toMatch(ISO_DATE);
      const parsed = new Date(`${checkedOn}T00:00:00Z`);
      expect(Number.isNaN(parsed.getTime())).toBe(false);
      // Round-trips, so "2026-02-30" can't slip through as March 2.
      expect(parsed.toISOString().slice(0, 10)).toBe(checkedOn);
    },
  );

  it.each(OUTDOORS_DESTINATIONS.map((d) => [d.id, d.logistics.checkedOn]))(
    "%s was checked within the last year and not in the future",
    (_id, checkedOn) => {
      const ageDays = (Date.now() - Date.parse(`${checkedOn}T00:00:00Z`)) / DAY_MS;
      expect(ageDays).toBeGreaterThan(-1);
      expect(ageDays).toBeLessThanOrEqual(MAX_AGE_DAYS);
    },
  );
});
