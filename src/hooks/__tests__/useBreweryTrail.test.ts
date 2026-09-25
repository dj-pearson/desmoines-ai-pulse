import { describe, expect, it, vi } from "vitest";
import { fromZonedTime } from "date-fns-tz";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));

import {
  breweryEventNotOver,
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
