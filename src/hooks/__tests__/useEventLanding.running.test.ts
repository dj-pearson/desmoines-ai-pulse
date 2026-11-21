import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * /events/free and /events/kids are window-less ("upcoming") landings. They
 * used to send a bare `date >= start of today`, so a free festival that opened
 * yesterday and runs through Sunday left both pages on its second morning
 * while the hub, site search and the .ics feeds kept it (WEB-FEAT-041/045).
 *
 * The stand-in client records each filter call and answers with no rows.
 */
const calls = vi.hoisted(() => ({ filters: [] as Array<[string, unknown[]]> }));
vi.mock("@/integrations/supabase/client", () => {
  const builder = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const method of ["neq", "is", "gte", "lte", "lt", "or", "order", "limit", "in"]) {
      chain[method] = (...args: unknown[]) => {
        calls.filters.push([method, args]);
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
  useEventLanding,
  ongoingStartFilter,
  KIDS_EVENTS_FILTER,
} from "@/hooks/useEventLanding";
import { FREE_PRICE_FILTER } from "@/lib/eventPrice";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

async function filtersFor(options: Parameters<typeof useEventLanding>[0]) {
  calls.filters.length = 0;
  const { result } = renderHook(() => useEventLanding(options), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  return [...calls.filters];
}

const dateFloor = (filters: Array<[string, unknown[]]>) =>
  filters.filter(([method, args]) => method === "gte" && args[0] === "date");
const orBodies = (filters: Array<[string, unknown[]]>) =>
  filters.filter(([method]) => method === "or").map(([, args]) => String(args[0]));

describe("window-less landings keep a run that started before today", () => {
  it("/events/free sends one or() that ANDs the running window with the free filter", async () => {
    const filters = await filtersFor({ key: { landing: "free" }, or: FREE_PRICE_FILTER, limit: 100 });
    expect(dateFloor(filters)).toEqual([]);
    const ors = orBodies(filters);
    // A second .or() is a second `or` param, which PostgREST does not promise to AND.
    expect(ors).toHaveLength(1);
    expect(ors[0]).toMatch(/^and\(or\(date\.gte\."[^"]+",and\(date\.lt\."[^"]+",end_date\.gte\."[^"]+"\)\),or\(/);
    expect(ors[0].endsWith(`or(${FREE_PRICE_FILTER}))`)).toBe(true);
  });

  it("/events/kids gets the same window", async () => {
    const filters = await filtersFor({ key: { landing: "kids" }, or: KIDS_EVENTS_FILTER, limit: 100 });
    expect(dateFloor(filters)).toEqual([]);
    const ors = orBodies(filters);
    expect(ors).toHaveLength(1);
    expect(ors[0]).toContain("end_date.gte.");
    expect(ors[0].endsWith(`or(${KIDS_EVENTS_FILTER}))`)).toBe(true);
  });

  it("with no audience filter the running window is the whole or()", async () => {
    const filters = await filtersFor({ key: { landing: "upcoming" }, limit: 10 });
    expect(dateFloor(filters)).toEqual([]);
    const ors = orBodies(filters);
    expect(ors).toHaveLength(1);
    const from = /date\.gte\."([^"]+)"/.exec(ors[0])?.[1];
    expect(from).toBeDefined();
    expect(ors[0]).toBe(ongoingStartFilter(from!));
    // The floor is still the start of today Central, not "now".
    expect(new Date(from!).toISOString()).toBe(from);
  });

  it("orders by start, so a run that opened earlier sorts before today's starts", async () => {
    const filters = await filtersFor({ key: { landing: "free" }, or: FREE_PRICE_FILTER, limit: 100 });
    expect(filters).toContainEqual(["order", ["date", { ascending: true }]]);
    expect(filters).toContainEqual(["limit", [100]]);
  });
});

describe("windowed landings are unchanged", () => {
  it("without includeOngoing a window still floors on its own start", async () => {
    const filters = await filtersFor({
      key: { landing: "date-night" },
      window: { kind: "range", from: "2026-11-08", to: "2026-11-21" },
      limit: 50,
    });
    expect(dateFloor(filters)).toHaveLength(1);
    expect(orBodies(filters)).toEqual([]);
    expect(filters.some(([method, args]) => method === "lte" && args[0] === "date")).toBe(true);
  });

  it("with includeOngoing a window uses the running filter and keeps its end bound", async () => {
    const filters = await filtersFor({
      key: { landing: "weekend" },
      window: { kind: "range", from: "2026-11-13", to: "2026-11-15" },
      includeOngoing: true,
      limit: 50,
    });
    expect(dateFloor(filters)).toEqual([]);
    expect(orBodies(filters)[0]).toContain("end_date.gte.");
    expect(filters.some(([method, args]) => method === "lte" && args[0] === "date")).toBe(true);
  });
});
