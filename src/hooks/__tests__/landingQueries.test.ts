import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * A recording stand-in for the supabase client: every events read logs the
 * select it asked for and each filter, then answers with no rows. The diet and
 * brewery helpers below never touch it.
 */
const calls = vi.hoisted(() => ({ selects: [] as string[], filters: [] as string[] }));
vi.mock("@/integrations/supabase/client", () => {
  const builder = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const method of ["neq", "is", "gte", "lte", "or", "order", "limit", "in"]) {
      chain[method] = (...args: unknown[]) => {
        calls.filters.push(`${method}:${JSON.stringify(args)}`);
        return chain;
      };
    }
    chain.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: [], error: null });
    return chain;
  };
  return {
    supabase: {
      from: () => ({
        select: (columns: string) => {
          calls.selects.push(columns);
          return builder();
        },
      }),
    },
  };
});

import { DIETS, dietFromParam, dietOrClause } from "@/hooks/useDietaryRestaurants";
import { breweryVenueClause } from "@/hooks/useBreweryTrail";
import { useEventLanding, LANDING_LIGHT_COLUMNS } from "@/hooks/useEventLanding";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import {
  MIN_EVENTS_PER_MONTH,
  isIndexableMonth,
  isMonthInRange,
  isYearInRange,
  parseMonthSlug,
  monthSlug,
  shiftMonth,
  centralMonthOf,
} from "@/lib/monthPages";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

describe("light rows for counts (events-pass2 WP3 item 7)", () => {
  it("every light column is in the card projection, and no description is", () => {
    const card = new Set(EVENT_LIST_COLUMNS.split(",").map((c) => c.trim()));
    const light = LANDING_LIGHT_COLUMNS.split(",").map((c) => c.trim());
    for (const column of light) expect(card.has(column), column).toBe(true);
    expect(light).not.toContain("enhanced_description");
    expect(light).not.toContain("original_description");
  });

  it("the month request for the full window selects no enhanced_description", async () => {
    calls.selects.length = 0;
    const { result } = renderHook(
      () =>
        useEventLanding({
          key: { landing: "month" },
          window: { kind: "month", year: 2026, month: 9 },
          limit: 1000,
          columns: LANDING_LIGHT_COLUMNS,
        }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.selects).toEqual([LANDING_LIGHT_COLUMNS]);
    expect(calls.selects[0]).not.toMatch(/enhanced_description/);
  });

  it("without columns, a landing still asks for the card projection", async () => {
    calls.selects.length = 0;
    const { result } = renderHook(
      () => useEventLanding({ key: { landing: "free" }, limit: 100 }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.selects).toEqual([EVENT_LIST_COLUMNS]);
  });
});

describe("month pages (events-pass2 WP3 item 6)", () => {
  // Fri 2026-09-25, 20:00 CDT
  const now = new Date("2026-09-26T01:00:00Z");

  it("reads the current month in Central", () => {
    // 2026-10-01 01:00Z is still Sep 30 in Central.
    expect(centralMonthOf(new Date("2026-10-01T01:00:00Z"))).toEqual({ year: 2026, month: 9 });
    expect(centralMonthOf(now)).toEqual({ year: 2026, month: 9 });
  });

  it("is in range from last month to twelve months ahead", () => {
    expect(isMonthInRange({ year: 2026, month: 8 }, now)).toBe(true);
    expect(isMonthInRange({ year: 2026, month: 7 }, now)).toBe(false);
    expect(isMonthInRange({ year: 2027, month: 9 }, now)).toBe(true);
    expect(isMonthInRange({ year: 2027, month: 10 }, now)).toBe(false);
  });

  it("is indexable only in range with at least three events", () => {
    expect(MIN_EVENTS_PER_MONTH).toBe(3);
    expect(isIndexableMonth({ year: 2026, month: 9 }, 3, now)).toBe(true);
    expect(isIndexableMonth({ year: 2026, month: 9 }, 2, now)).toBe(false);
    expect(isIndexableMonth({ year: 1998, month: 3 }, 50, now)).toBe(false);
  });

  it("renders the not-found state for years the range doesn't touch", () => {
    expect(isYearInRange(1998, now)).toBe(false);
    expect(isYearInRange(2026, now)).toBe(true);
    expect(isYearInRange(2027, now)).toBe(true);
    expect(isYearInRange(2028, now)).toBe(false);
  });

  it("parses and builds slugs, and shifts across a year", () => {
    expect(parseMonthSlug("September-2026")).toEqual({ year: 2026, month: 9 });
    expect(parseMonthSlug("smarch-2026")).toBeNull();
    expect(monthSlug(shiftMonth({ year: 2026, month: 12 }, 1))).toBe("january-2027");
    expect(monthSlug(shiftMonth({ year: 2026, month: 1 }, -1))).toBe("december-2025");
  });
});

describe("dietFromParam", () => {
  it("resolves each of the six diets", () => {
    for (const d of DIETS) expect(dietFromParam(d.id)?.id).toBe(d.id);
  });

  it("treats an unknown, empty or missing slug as no diet", () => {
    expect(dietFromParam("foo")).toBeNull();
    expect(dietFromParam("")).toBeNull();
    expect(dietFromParam(null)).toBeNull();
    expect(dietFromParam("undefined")).toBeNull();
  });

  it("ignores case and surrounding space", () => {
    expect(dietFromParam(" Vegan ")?.id).toBe("vegan");
  });
});

describe("dietOrClause", () => {
  it("matches every keyword against name, cuisine and description", () => {
    const keto = dietFromParam("keto");
    expect(keto).not.toBeNull();
    const clause = dietOrClause(keto!);
    for (const k of keto!.keywords) {
      expect(clause).toContain(`description.ilike.%${k}%`);
      expect(clause).toContain(`name.ilike.%${k}%`);
      expect(clause).toContain(`cuisine.ilike.%${k}%`);
    }
  });
});

describe("breweryVenueClause", () => {
  it("builds one venue ilike per distinct name", () => {
    expect(breweryVenueClause(["Exile Brewing", "Exile Brewing", "Confluence Brewing"])).toBe(
      "venue.ilike.%Confluence Brewing%,venue.ilike.%Exile Brewing%",
    );
  });

  it("strips characters that would end or group the or clause", () => {
    const clause = breweryVenueClause(["Fox Brewing, Inc. (West)"]);
    expect(clause).toBe("venue.ilike.%Fox Brewing Inc. West%");
  });

  it("escapes LIKE wildcards in a name", () => {
    expect(breweryVenueClause(["100% Hops"])).toBe("venue.ilike.%100\\% Hops%");
  });

  it("returns null when no usable name is left", () => {
    expect(breweryVenueClause([])).toBeNull();
    expect(breweryVenueClause(["", "()"])).toBeNull();
  });
});
