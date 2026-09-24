import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromZonedTime } from "date-fns-tz";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  clockLabelToMinutes,
  deriveOpenNow,
  isListableRow,
  pastMidnightInstant,
  type OpenNowRestaurantRow,
} from "@/hooks/useOpenNowRestaurants";

/**
 * The open-now derivation (eat-drink plan WP5). Runs with the process zone at
 * Los Angeles, so anything reading the browser zone instead of Central fails.
 */
function central(local: string): Date {
  return fromZonedTime(local, "America/Chicago");
}

function row(id: string, opening: string | null, extra: Partial<OpenNowRestaurantRow> = {}): OpenNowRestaurantRow {
  return { id, name: id, opening, status: "active", is_merged: false, ...extra };
}

const ROWS: OpenNowRestaurantRow[] = [
  row("Late Bar", "Daily 4pm-2am"),
  row("Dinner Place", "Daily 11am-10pm"),
  row("Lunch Only", "Daily 11am-2pm"),
  row("Closes Soon", "Daily 7am-9:45pm"),
  row("Merged Twin", "Daily 11am-10pm", { is_merged: true }),
  row("Gone", "Daily 11am-10pm", { status: "closed" }),
  row("No Hours", null),
];

describe("useOpenNowRestaurants derivation", () => {
  const original = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Los_Angeles";
  });
  afterAll(() => {
    process.env.TZ = original;
  });

  it("drops merged, closed and hour-less rows", () => {
    expect(ROWS.filter(isListableRow).map((r) => r.id)).toEqual([
      "Late Bar",
      "Dinner Place",
      "Lunch Only",
      "Closes Soon",
    ]);
  });

  it("reads clock labels back to minutes", () => {
    expect(clockLabelToMinutes("10 PM")).toBe(22 * 60);
    expect(clockLabelToMinutes("9:45 PM")).toBe(21 * 60 + 45);
    expect(clockLabelToMinutes("12 AM")).toBe(0);
    expect(clockLabelToMinutes("midnight")).toBe(0);
    expect(clockLabelToMinutes("noon")).toBe(720);
    expect(clockLabelToMinutes("soon")).toBeNull();
  });

  it("sorts open places by time left and splits off closing-within-the-hour", () => {
    const view = deriveOpenNow(ROWS, central("2026-09-24T21:00:00"));
    expect(view.open.map((e) => e.restaurant.id)).toEqual(["Late Bar"]);
    expect(view.closingSoon.map((e) => e.restaurant.id)).toEqual(["Dinner Place", "Closes Soon"]);
    expect(view.withListedHours).toBe(4);
  });

  it("uses Central time, not the browser zone", () => {
    // 21:30 in Los Angeles is 23:30 in Des Moines: the 10 PM place is closed.
    const view = deriveOpenNow(ROWS, new Date("2026-09-25T04:30:00Z"));
    const openIds = [...view.open, ...view.closingSoon].map((e) => e.restaurant.id);
    expect(openIds).toEqual(["Late Bar"]);
  });

  it("lists the next to open when nothing is", () => {
    const view = deriveOpenNow(ROWS, central("2026-09-25T03:00:00"));
    expect(view.open).toHaveLength(0);
    expect(view.closingSoon).toHaveLength(0);
    expect(view.nextToOpen[0].restaurant.id).toBe("Closes Soon");
    expect(view.nextToOpen[0].status.nextOpensAt).toBe("7 AM");
  });

  it("finds places open past midnight tonight", () => {
    expect(pastMidnightInstant(central("2026-09-24T20:00:00")).toISOString()).toBe(
      central("2026-09-25T00:30:00").toISOString(),
    );
    expect(pastMidnightInstant(central("2026-09-25T01:00:00")).toISOString()).toBe(
      central("2026-09-25T00:30:00").toISOString(),
    );
    const view = deriveOpenNow(ROWS, central("2026-09-24T20:00:00"));
    expect(view.openPastMidnight.map((e) => e.restaurant.id)).toEqual(["Late Bar"]);
  });
});
