import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => undefined }) }));

import { pickHubRestaurants } from "@/hooks/useArticles";
import { ARTICLE_HUB_RESTAURANT_COLUMNS } from "@/lib/listColumns";
import type { StoredOpeningHours } from "@/lib/restaurantHours";

/**
 * WEB-FEAT-042: the "Open now" block under a food article read only
 * `opening`, which production stores as a date (SEO-054), so it could never
 * find an open restaurant, and it never read business_status, so a
 * CLOSED_TEMPORARILY place could be recommended under "Places to try".
 */

// Wed 2026-09-30 12:00 CDT.
const NOON_WEDNESDAY = new Date("2026-09-30T17:00:00Z");
// Wed 2026-09-30 22:00 CDT.
const TEN_PM_WEDNESDAY = new Date("2026-10-01T03:00:00Z");

/** Mon-Sat 07:00-14:00 in Google's shape. */
const LUNCH_HOURS: StoredOpeningHours = {
  version: 1,
  timeZone: "America/Chicago",
  periods: [1, 2, 3, 4, 5, 6].map((day) => ({
    open: { day, hour: 7, minute: 0 },
    close: { day, hour: 14, minute: 0 },
  })),
  weekdayDescriptions: [],
};

function row(id: string, extra: Partial<Parameters<typeof pickHubRestaurants>[0][number]> = {}) {
  return {
    id,
    slug: id,
    name: `Place ${id}`,
    status: "open",
    business_status: "OPERATIONAL",
    cuisine: null,
    // What production holds in `opening`: a date, never hours.
    opening: "2019-05-01",
    hours_json: LUNCH_HOURS,
    ...extra,
  };
}

describe("pickHubRestaurants (WEB-FEAT-042)", () => {
  it("finds open places from hours_json when `opening` is a date", () => {
    const result = pickHubRestaurants([row("a"), row("b", { hours_json: null })], [], NOON_WEDNESDAY);
    expect(result.mode).toBe("open-now");
    expect(result.items.map((i) => i.id)).toEqual(["a"]);
  });

  it("falls back to 'places' when the hours say everything is shut", () => {
    const result = pickHubRestaurants([row("a"), row("b")], [], TEN_PM_WEDNESDAY);
    expect(result.mode).toBe("places");
    expect(result.items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("does not call a CLOSED_TEMPORARILY place open from its weekly hours", () => {
    const result = pickHubRestaurants(
      [row("shut", { business_status: "CLOSED_TEMPORARILY" }), row("a")],
      [],
      NOON_WEDNESDAY,
    );
    expect(result.items.map((i) => i.id)).toEqual(["a"]);
  });

  it("never offers a temporarily or permanently closed place under 'Places to try'", () => {
    const result = pickHubRestaurants(
      [
        row("temp", { business_status: "CLOSED_TEMPORARILY" }),
        row("gone", { business_status: "CLOSED_PERMANENTLY" }),
        row("soon", { status: "opening_soon" }),
        row("a"),
      ],
      [],
      TEN_PM_WEDNESDAY,
    );
    expect(result.mode).toBe("places");
    expect(result.items.map((i) => i.id)).toEqual(["a"]);
  });

  it("still reads hours text in `opening` for a row without hours_json", () => {
    const result = pickHubRestaurants(
      [row("text", { hours_json: null, opening: "Mon-Sun 6am-11pm" })],
      [],
      NOON_WEDNESDAY,
    );
    expect(result.mode).toBe("open-now");
  });
});

describe("ARTICLE_HUB_RESTAURANT_COLUMNS", () => {
  it("selects the columns pickHubRestaurants reads", () => {
    const cols = ARTICLE_HUB_RESTAURANT_COLUMNS.split(",").map((c) => c.trim());
    for (const c of ["hours_json", "business_status", "opening", "status", "cuisine", "slug", "name"]) {
      expect(cols).toContain(c);
    }
  });

  it("is the projection the hub query uses", () => {
    const src = readFileSync("src/hooks/useArticles.ts", "utf8");
    expect(src).toMatch(/\.select\(ARTICLE_HUB_RESTAURANT_COLUMNS\)/);
  });
});
