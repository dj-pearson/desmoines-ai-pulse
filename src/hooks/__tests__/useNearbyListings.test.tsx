import { type ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The nearby rail is one request per rail, without description columns
 * (a second by-id request pushed event detail past its request budget).
 * Every request is recorded: table, select string, and any in.(id) list.
 */
interface Call {
  table: string;
  select: string;
  inIds?: string[];
}
const calls: Call[] = [];
let scanRows: Record<string, unknown>[] = [];

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
        resolve({ data: scanRows, error: null });
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
  it("one request without descriptions, nearest survivors in order", async () => {
    scanRows = [
      { id: "far", name: "Far", latitude: LAT + 0.02, longitude: LNG, status: "open" },
      { id: "near", name: "Near", latitude: LAT + 0.001, longitude: LNG, status: "open" },
      { id: "mid", name: "Mid", latitude: LAT + 0.01, longitude: LNG, status: "open" },
      { id: "closed", name: "Closed", latitude: LAT, longitude: LNG, status: "closed" },
      { id: "self", name: "Self", latitude: LAT, longitude: LNG, status: "open" },
    ];

    const { result } = renderHook(
      () => useNearbyListings("restaurants", LAT, LNG, { excludeId: "self", limit: 2 }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.data?.length).toBe(2));
    expect(result.current.data?.map((r) => r.id)).toEqual(["near", "mid"]);
    expect((result.current.data?.[0] as { name?: string } | undefined)?.name).toBe("Near");
    expect(result.current.isLoading).toBe(false);

    expect(calls).toHaveLength(1);
    expect(calls[0].select).not.toMatch(/description/);
    expect(calls[0].select).toMatch(/\bname\b/);
    expect(calls[0].select).toMatch(/business_status/);
    expect(calls[0].inIds).toBeUndefined();
  });

  it("an empty scan is an empty list from one request", async () => {
    scanRows = [];
    const { result } = renderHook(() => useNearbyListings("events", LAT, LNG), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(result.current.isLoading).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].select).not.toMatch(/description/);
    expect(calls[0].select).toMatch(/\btitle\b/);
  });

  it("no coordinates, no request and not loading", () => {
    const { result } = renderHook(() => useNearbyListings("events", null, null), { wrapper: wrapper() });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
