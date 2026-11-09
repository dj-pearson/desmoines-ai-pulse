import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * /restaurants/dietary/:diet selected RESTAURANT_LIST_COLUMNS, which carries
 * neither hours_json nor business_status, and filtered only status = 'closed'.
 * So a Google CLOSED_PERMANENTLY row and a 'permanently_closed' status were
 * listed as places to eat, a CLOSED_TEMPORARILY place could sit first in the
 * grid with no label, and no card could say "Open until" because production
 * keeps a date in `opening`.
 *
 * The mock records every builder call and answers with the rows below, in the
 * name order the query asks for.
 */
type Call = [string, ...unknown[]];
const calls: Call[] = [];

const ROWS = vi.hoisted(() => [
  { id: "a-temp", name: "Aster", status: "open", business_status: "CLOSED_TEMPORARILY" },
  { id: "b-gone-google", name: "Basil", status: "open", business_status: "CLOSED_PERMANENTLY" },
  { id: "c-open", name: "Clover", status: null, business_status: "OPERATIONAL", hours_json: { periods: [] } },
  { id: "d-gone-own", name: "Dill", status: "permanently_closed", business_status: null },
  { id: "e-soon", name: "Elder", status: "opening_soon", business_status: null },
  { id: "f-open", name: "Fennel", status: "newly_opened", business_status: null },
]);

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "neq", "or", "order", "limit"]) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: ROWS, error: null });
  return { supabase: { from: () => chain } };
});

import { DIETS, dietaryListRows, useDietaryRestaurants } from "@/hooks/useDietaryRestaurants";
import { DIETARY_RESTAURANT_COLUMNS } from "@/lib/listColumns";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const vegan = DIETS.find((d) => d.id === "vegan")!;

describe("dietary restaurant lists and closed places", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("selects the columns the card needs to say open, closed or temporarily closed", async () => {
    const { result } = renderHook(() => useDietaryRestaurants(vegan), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls).toContainEqual(["select", DIETARY_RESTAURANT_COLUMNS]);
    const columns = DIETARY_RESTAURANT_COLUMNS.split(",").map((c) => c.trim());
    expect(columns).toEqual(expect.arrayContaining(["hours_json", "business_status", "status", "opening"]));
    // The server-side guards are unchanged.
    expect(calls).toContainEqual(["neq", "is_merged", true]);
  });

  it("drops places closed for good, by our status or Google's", async () => {
    const { result } = renderHook(() => useDietaryRestaurants(vegan), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const ids = (result.current.data ?? []).map((r) => r.id);
    expect(ids).not.toContain("b-gone-google");
    expect(ids).not.toContain("d-gone-own");
  });

  it("lists serving places first and keeps a temporarily closed or not-yet-open one after them", async () => {
    const { result } = renderHook(() => useDietaryRestaurants(vegan), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((result.current.data ?? []).map((r) => r.id)).toEqual(["c-open", "f-open", "a-temp", "e-soon"]);
  });

  it("passes the row's hours and Google status through to the card", async () => {
    const { result } = renderHook(() => useDietaryRestaurants(vegan), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const rows = result.current.data ?? [];
    expect(rows.find((r) => r.id === "c-open")?.hours_json).toEqual({ periods: [] });
    expect(rows.find((r) => r.id === "a-temp")?.business_status).toBe("CLOSED_TEMPORARILY");
  });

  it("an empty answer stays empty", () => {
    expect(dietaryListRows([])).toEqual([]);
  });
});
