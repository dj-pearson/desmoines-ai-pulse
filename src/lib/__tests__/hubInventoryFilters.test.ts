import { createElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * WEB-SEO-057. scripts/check-hub-inventory.mjs counts what each hand-built
 * event hub has to list, and says its predicates mirror the pages. It is a
 * plain .mjs script, so it restates the filters rather than importing them;
 * this suite is what keeps the restatement honest.
 *
 * It sent a bare `date >= start of today` for every hub. /events/free uses
 * useEventLanding's running window (ongoingStartFilter) and the suburb pages
 * use the hub's notOverFilter, so the report missed day two of a festival
 * and could call a hub thin when the page was not.
 */
const calls = vi.hoisted(() => ({ ors: [] as string[], gtes: [] as unknown[][] }));
vi.mock("@/integrations/supabase/client", () => {
  const builder = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const method of ["neq", "is", "gte", "lte", "lt", "or", "order", "limit", "in"]) {
      chain[method] = (...args: unknown[]) => {
        if (method === "or") calls.ors.push(String(args[0]));
        if (method === "gte") calls.gtes.push(args);
        return chain;
      };
    }
    chain.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: [], error: null });
    return chain;
  };
  return { supabase: { from: () => ({ select: () => builder() }) } };
});

import {
  hubQueries,
  notOverFilter as scriptNotOver,
  ongoingStartFilter as scriptOngoing,
  upcomingFloor as scriptFloor,
  FREE_PRICE_FILTER as SCRIPT_FREE,
} from "../../../scripts/check-hub-inventory.mjs";
import { useEventLanding, ongoingStartFilter } from "@/hooks/useEventLanding";
import { notOverFilter } from "@/components/events/eventsHubQuery";
import { eventAreaOrFilter, findEventArea } from "@/lib/eventAreas";
import { FREE_PRICE_FILTER } from "@/lib/eventPrice";
import { SUBURBS } from "@/lib/suburbs";
import { upcomingFloorUtc } from "@/lib/timezone";

/** CDT afternoon, CST morning, just after Central midnight, and a DST-change day. */
const INSTANTS = [
  new Date("2026-07-18T19:45:00Z"),
  new Date("2026-12-05T15:10:00Z"),
  new Date("2026-11-08T06:20:00Z"),
  new Date("2026-03-08T12:00:00Z"),
];

interface HubQuery {
  route: string;
  params: URLSearchParams;
}
const queriesAt = (now: Date) => hubQueries(now) as HubQuery[];

afterEach(() => {
  vi.useRealTimers();
});

describe("check-hub-inventory restates the page helpers exactly", () => {
  it.each(INSTANTS)("notOverFilter, ongoingStartFilter and the floor agree at %s", (now) => {
    expect(scriptNotOver(now)).toBe(notOverFilter(now));
    expect(scriptFloor(now)).toBe(upcomingFloorUtc(now));
    expect(scriptOngoing(scriptFloor(now))).toBe(ongoingStartFilter(upcomingFloorUtc(now)));
  });

  it("uses the site's one free-price filter", () => {
    expect(SCRIPT_FREE).toBe(FREE_PRICE_FILTER);
  });
});

describe("the hubs it counts", () => {
  it("covers every suburb page plus /events/free, with the visibility predicates", () => {
    const queries = queriesAt(INSTANTS[0]);
    expect(queries.map((q) => q.route).sort()).toEqual(
      [...Object.keys(SUBURBS).map((slug) => `/events/${slug}`), "/events/free"].sort(),
    );
    for (const { params } of queries) {
      expect(params.get("is_merged")).toBe("neq.true");
      expect(params.get("is_hidden")).toBe("neq.true");
      expect(params.get("archived_at")).toBe("is.null");
      // The old bare floor. Each page's window lives inside its one or= now.
      expect(params.get("date")).toBeNull();
      expect(params.getAll("or")).toHaveLength(1);
    }
  });

  it.each(INSTANTS)("a suburb is counted with EventsByLocation's place and not-over group at %s", (now) => {
    for (const { route, params } of queriesAt(now)) {
      if (route === "/events/free") continue;
      const area = findEventArea(route.replace("/events/", ""));
      expect(area).toBeDefined();
      const place = eventAreaOrFilter(area!);
      expect(params.get("or")).toBe(`(and(or(${place}),or(${notOverFilter(now)})))`);
    }
  });

  it("EventsByLocation still composes its query that way", () => {
    const page = readFileSync("src/pages/EventsByLocation.tsx", "utf8");
    expect(page).toContain(".or(`and(or(${placeFilter}),or(${notOverFilter(new Date())}))`)");
    expect(page).toMatch(/return area \? eventAreaOrFilter\(area\) : null;/);
  });

  it.each(INSTANTS)("/events/free is counted with exactly what FreeEvents sends at %s", async (now) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    calls.ors.length = 0;
    calls.gtes.length = 0;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    // The same options FreeEvents.tsx passes.
    const { result } = renderHook(
      () => useEventLanding({ key: { landing: "free" }, or: FREE_PRICE_FILTER, limit: 200 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(calls.gtes).toEqual([]);
    expect(calls.ors).toHaveLength(1);
    const free = queriesAt(now).find((q) => q.route === "/events/free");
    // supabase-js wraps an .or() body in parentheses on the wire.
    expect(free?.params.get("or")).toBe(`(${calls.ors[0]})`);
  });

  it("FreeEvents still calls useEventLanding with no window and FREE_PRICE_FILTER", () => {
    const page = readFileSync("src/pages/FreeEvents.tsx", "utf8");
    expect(page).toMatch(/useEventLanding\(\{ key: \{ landing: "free" \}, or: FREE_PRICE_FILTER, limit: FETCH_LIMIT \}\)/);
  });
});
