import { describe, it, expect, beforeEach } from "vitest";
import {
  buildShortlistICS,
  MAX_SHORTLIST,
  parseShortlistParam,
  readStoredShortlist,
  serializeShortlist,
  SHORTLIST_STORAGE_KEY,
  shortlistEntries,
  toggleShortlist,
  writeStoredShortlist,
} from "@/lib/tripShortlist";
import { storage } from "@/lib/safeStorage";
import type { LandingEvent } from "@/hooks/useEventLanding";

// plan-stay-pass2 WP1 item 6: the free trip calendar.

const A = "51000000-0000-0000-0000-000000000001";
const B = "51000000-0000-0000-0000-000000000002";
const WINDOW = { from: "2026-10-09", to: "2026-10-11" };

function event(id: string, extra: Partial<LandingEvent> = {}): LandingEvent {
  return {
    id,
    title: `Event ${id.slice(-1)}`,
    date: "2026-10-09T23:00:00+00:00",
    event_start_utc: "2026-10-09T23:00:00+00:00",
    event_start_local: "2026-10-09T18:00:00",
    end_date: null,
    venue: "Wells Fargo Arena",
    location: null,
    ...extra,
  } as unknown as LandingEvent;
}

describe("?e= parsing", () => {
  it("reads ids, drops junk and duplicates", () => {
    expect(parseShortlistParam(`${A},${A}, ${B},<script>,`)).toEqual([A, B]);
    expect(parseShortlistParam(null)).toEqual([]);
  });

  it("caps at MAX_SHORTLIST", () => {
    const many = Array.from({ length: MAX_SHORTLIST + 5 }, (_, i) => `id-${i}`).join(",");
    expect(parseShortlistParam(many)).toHaveLength(MAX_SHORTLIST);
  });

  it("serializes an empty list as no parameter", () => {
    expect(serializeShortlist([])).toBeNull();
    expect(serializeShortlist([A, B])).toBe(`${A},${B}`);
  });
});

describe("toggleShortlist", () => {
  it("adds and removes", () => {
    expect(toggleShortlist([], A)).toEqual([A]);
    expect(toggleShortlist([A, B], A)).toEqual([B]);
  });

  it("won't grow past the cap", () => {
    const full = Array.from({ length: MAX_SHORTLIST }, (_, i) => `id-${i}`);
    expect(toggleShortlist(full, "one-more")).toEqual(full);
  });
});

describe("storage mirror", () => {
  beforeEach(() => storage.remove(SHORTLIST_STORAGE_KEY));

  it("round-trips under the versioned key and clears when empty", () => {
    writeStoredShortlist([A, B]);
    expect(readStoredShortlist()).toEqual([A, B]);
    writeStoredShortlist([]);
    expect(storage.get(SHORTLIST_STORAGE_KEY, null)).toBeNull();
  });

  it("ignores a stored value of the wrong shape", () => {
    storage.set(SHORTLIST_STORAGE_KEY, { ids: [A] });
    expect(readStoredShortlist()).toEqual([]);
  });
});

describe("buildShortlistICS", () => {
  it("writes a 6 PM Central start as 23:00Z", () => {
    const ics = buildShortlistICS([event(A)], WINDOW);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("DTSTART:20261009T230000Z");
    expect(ics).toContain("DTEND:20261010T000000Z");
    expect(ics).toContain(`UID:${A}@desmoinesinsider`);
  });

  it("exports an event with no published time as all-day", () => {
    // Event in src/lib/types.ts declares event_start_utc as optional string,
    // but PostgREST sends null for an event with no published time, which is
    // the case under test; hence the cast through unknown.
    const untimed = event(B, {
      date: "2026-10-10T19:31:58-05:00",
      event_start_utc: null,
      event_start_local: "2026-10-10T19:31:58",
    } as unknown as Partial<LandingEvent>);
    const [entry] = shortlistEntries([untimed], WINDOW);
    expect(entry?.kind).toBe("all-day");
    const ics = buildShortlistICS([untimed], WINDOW);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261010");
    expect(ics).toContain("DTEND;VALUE=DATE:20261011");
  });

  it("clips a long run to the trip window as all-day", () => {
    const exhibit = event(B, {
      date: "2026-03-01T16:00:00+00:00",
      event_start_utc: "2026-03-01T16:00:00+00:00",
      event_start_local: "2026-03-01T10:00:00",
      end_date: "2026-12-31T23:00:00+00:00",
    });
    const ics = buildShortlistICS([exhibit], WINDOW);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261009");
    expect(ics).toContain("DTEND;VALUE=DATE:20261012");
  });

  it("holds two picks as two VEVENTs", () => {
    const ics = buildShortlistICS([event(A), event(B, { date: "2026-10-10T15:00:00+00:00", event_start_utc: "2026-10-10T15:00:00+00:00", event_start_local: "2026-10-10T10:00:00" })], WINDOW);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART:20261010T150000Z");
  });
});
