import { describe, expect, it, vi } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { readFileSync } from "node:fs";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));

import {
  breweryEventNotOver,
  breweryStatusLine,
  breweryVenueClause,
  breweryVenueName,
  splitBreweries,
} from "@/hooks/useBreweryTrail";

/** Eat & Drink pass 2 WP4.8 and WP4.11. */

function central(local: string): Date {
  return fromZonedTime(local, "America/Chicago");
}

describe("breweryVenueName", () => {
  it.each([
    ["Exile Brewing Company", "Exile Brewing"],
    ["Fox Brewing Co.", "Fox Brewing"],
    ["Peace Tree Brewing Co. Taproom", "Peace Tree Brewing"],
    ["Firetrucker Brewery, LLC", "Firetrucker Brewery"],
    ["515 Brewing Company", "515 Brewing"],
    ["Kinship Brewing Co", "Kinship Brewing"],
    ["Big Grove Brewpub", "Big Grove"],
    ["Confluence Brewing", "Confluence Brewing"],
  ])("%s -> %s", (name, expected) => {
    expect(breweryVenueName(name)).toBe(expected);
  });

  it("keeps two words rather than stripping down to one", () => {
    expect(breweryVenueName("Confluence Taproom")).toBe("Confluence Taproom");
    expect(breweryVenueName("Mistress Brewing Company Taproom")).toBe("Mistress Brewing");
  });

  it("gives null for a one-word name, which would match any venue containing it", () => {
    expect(breweryVenueName("Fox")).toBeNull();
    expect(breweryVenueName("Exile, LLC.")).toBe("Exile LLC");
    expect(breweryVenueName("")).toBeNull();
    expect(breweryVenueName(null)).toBeNull();
  });

  it("feeds the venue clause with the short form", () => {
    const names = ["Exile Brewing Company", "Fox"].map(breweryVenueName).filter((n): n is string => n !== null);
    expect(breweryVenueClause(names)).toBe("venue.ilike.%Exile Brewing%");
  });
});

describe("splitBreweries", () => {
  it("counts only places you can walk into today", () => {
    const rows = [
      { id: "a", status: "open" },
      { id: "b", status: null },
      { id: "c", status: "newly_opened" },
      { id: "d", status: "opening_soon" },
      { id: "e", status: "announced" },
      { id: "f", status: "permanently_closed" },
    ];
    const { visitable, upcoming } = splitBreweries(rows);
    expect(visitable.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(upcoming.map((r) => r.id)).toEqual(["d", "e"]);
  });
});

describe("splitBreweries and Google's closure flag (WEB-FEAT-044)", () => {
  it("leaves a CLOSED_PERMANENTLY place off the trail even while our own status still says open", () => {
    const rows = [
      { id: "a", status: "open", business_status: "OPERATIONAL" },
      { id: "b", status: null, business_status: "CLOSED_PERMANENTLY" },
      { id: "c", status: null, business_status: "CLOSED_TEMPORARILY" },
    ];
    const { visitable, upcoming } = splitBreweries(rows);
    // A temporary closure keeps its place in the passport; its card says so.
    expect(visitable.map((r) => r.id)).toEqual(["a", "c"]);
    expect(upcoming).toEqual([]);
  });
});

describe("breweryStatusLine (WEB-FEAT-044)", () => {
  // Wed 2026-09-30, Central.
  const wednesdayAt = (hhmm: string) => central(`2026-09-30T${hhmm}:00`);

  /** Production shape: `opening` is a date, the hours live only in hours_json. Wed-Sun 15:00-22:00. */
  const productionRow = {
    status: null,
    business_status: "OPERATIONAL",
    opening: "2016-04-01",
    hours_json: {
      version: 1,
      timeZone: "America/Chicago",
      periods: [3, 4, 5, 6, 0].map((day) => ({
        open: { day, hour: 15, minute: 0 },
        close: { day, hour: 22, minute: 0 },
      })),
      weekdayDescriptions: [],
    },
  };

  it("reads hours_json on a production-shaped row", () => {
    expect(breweryStatusLine(productionRow, wednesdayAt("17:00"))).toBe("Open until 10 PM");
    expect(breweryStatusLine(productionRow, wednesdayAt("11:00"))).toMatch(/^Closed, opens /);
  });

  it("never treats the date in `opening` as hours", () => {
    expect(breweryStatusLine({ ...productionRow, hours_json: null }, wednesdayAt("17:00"))).toBeNull();
  });

  it("still reads free-text hours when a row has no hours_json", () => {
    expect(
      breweryStatusLine({ status: null, opening: "Mon-Sun 11am-11pm", hours_json: null }, wednesdayAt("17:00")),
    ).toBe("Open until 11 PM");
  });

  it("says a CLOSED_TEMPORARILY taproom is closed instead of reading its weekly hours", () => {
    expect(
      breweryStatusLine({ ...productionRow, business_status: "CLOSED_TEMPORARILY" }, wednesdayAt("17:00")),
    ).toBe("Temporarily closed");
  });

  it("prints no hours for a place that is not open yet", () => {
    expect(breweryStatusLine({ ...productionRow, status: "opening_soon" }, wednesdayAt("17:00"))).toBeNull();
  });
});

describe("useBreweries projection (WEB-FEAT-044)", () => {
  it("selects the columns breweryStatusLine reads", async () => {
    const { BREWERY_TRAIL_COLUMNS } = await import("@/lib/listColumns");
    const columns = BREWERY_TRAIL_COLUMNS.split(",").map((c) => c.trim());
    for (const c of ["hours_json", "business_status", "opening", "status"]) expect(columns).toContain(c);
    const hook = readFileSync("src/hooks/useBreweryTrail.ts", "utf8");
    expect(hook).toMatch(/\.select\(BREWERY_TRAIL_COLUMNS\)/);
  });

  it("the page passes the row to breweryStatusLine rather than reading `opening` alone", () => {
    const page = readFileSync("src/pages/BreweryTrail.tsx", "utf8");
    expect(page).toMatch(/breweryStatusLine\(brewery, now\)/);
    expect(page).not.toMatch(/resolveOpenStatus\(undefined/);
  });
});

describe("breweryEventNotOver", () => {
  const now = central("2026-09-25T21:00:00");

  it("drops a timed event that started this morning", () => {
    expect(breweryEventNotOver({ date: "2026-09-25", event_start_utc: central("2026-09-25T10:00:00").toISOString() }, now)).toBe(false);
  });

  it("keeps one that started an hour ago", () => {
    expect(breweryEventNotOver({ date: "2026-09-25", event_start_utc: central("2026-09-25T20:00:00").toISOString() }, now)).toBe(true);
  });

  it("uses end_date when there is one", () => {
    expect(
      breweryEventNotOver(
        {
          event_start_utc: central("2026-09-25T12:00:00").toISOString(),
          end_date: central("2026-09-25T23:00:00").toISOString(),
        },
        now,
      ),
    ).toBe(true);
    expect(
      breweryEventNotOver(
        {
          event_start_utc: central("2026-09-25T12:00:00").toISOString(),
          end_date: central("2026-09-25T18:00:00").toISOString(),
        },
        now,
      ),
    ).toBe(false);
  });

  it("keeps a date-only event until its Central day ends", () => {
    expect(breweryEventNotOver({ date: "2026-09-25" }, now)).toBe(true);
    expect(breweryEventNotOver({ date: "2026-09-24" }, now)).toBe(false);
  });
});
