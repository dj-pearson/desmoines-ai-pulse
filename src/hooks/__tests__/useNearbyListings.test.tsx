import { type ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The nearby rail scans narrow and fetches cards for the survivors only.
 * Every request is recorded: table, select string, and any in.(id) list.
 */
interface Call {
  table: string;
  select: string;
  inIds?: string[];
}
const calls: Call[] = [];
let scanRows: Record<string, unknown>[] = [];
let cardRows: Record<string, unknown>[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const call: Call = { table, select: "" };
      calls.push(call);
      const c: Record<string, unknown> = {};
      for (const m of ["neq", "is", "gte", "lte", "or", "order", "limit"]) c[m] = () => c;
      c.select = (cols: string) => {
        call.select = cols;
        return c;
      };
      c.in = (_col: string, ids: string[]) => {
        call.inIds = ids;
        return c;
      };
      c.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: call.inIds ? cardRows : scanRows, error: null });
      return c;
    },
  },
}));

import { useNearbyListings } from "@/hooks/useNearbyListings";

// Downtown. 0.01 degrees of latitude is about 0.69 miles.
const LAT = 41.5851;
const LNG = -93.6271;

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  calls.length = 0;
});

describe("useNearbyListings", () => {
  it("scans narrow, then fetches card columns for the nearest survivors in order", async () => {
    scanRows = [
      { id: "far", latitude: LAT + 0.02, longitude: LNG, status: "open" },
      { id: "near", latitude: LAT + 0.001, longitude: LNG, status: "open" },
      { id: "mid", latitude: LAT + 0.01, longitude: LNG, status: "open" },
      { id: "closed", latitude: LAT, longitude: LNG, status: "closed" },
      { id: "self", latitude: LAT, longitude: LNG, status: "open" },
    ];
    // The in.() response comes back in another order, with full card fields.
    cardRows = [
      { id: "mid", name: "Mid", description: "d", latitude: LAT + 0.01, longitude: LNG },
      { id: "near", name: "Near", description: "d", latitude: LAT + 0.001, longitude: LNG },
    ];

    const { result } = renderHook(
      () => useNearbyListings("restaurants", LAT, LNG, { excludeId: "self", limit: 2 }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.data?.length).toBe(2));
    expect(result.current.data?.map((r) => r.id)).toEqual(["near", "mid"]);
    expect(result.current.isLoading).toBe(false);

    expect(calls).toHaveLength(2);
    const [scan, cards] = calls;
    expect(scan.select).not.toMatch(/description|name/);
    expect(scan.inIds).toBeUndefined();
    expect(cards.select).toMatch(/description/);
    expect(cards.inIds).toEqual(["near", "mid"]);
  });

  it("an empty scan is an empty list with no card request", async () => {
    scanRows = [];
    const { result } = renderHook(() => useNearbyListings("events", LAT, LNG), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(result.current.isLoading).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].select).not.toMatch(/description|title/);
  });

  it("no coordinates, no request and not loading", () => {
    const { result } = renderHook(() => useNearbyListings("events", null, null), { wrapper: wrapper() });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
