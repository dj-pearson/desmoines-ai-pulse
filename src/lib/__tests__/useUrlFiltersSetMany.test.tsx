import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useUrlFilters } from "@/hooks/useUrlFilters";

/**
 * Events plan WP0 item 5. A preset has to write category, price and date in
 * one navigation: two setParam calls in one handler each start from the
 * render-time URL, and the second drops the first ("Free This Weekend" lost
 * "free").
 */
function setup(initial: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => ({ filters: useUrlFilters(), location: useLocation() }),
    { wrapper }
  );
}

describe("useUrlFilters.setMany", () => {
  it("writes every key in one navigation and resets page", () => {
    const { result } = setup("/events?page=3&q=jazz");
    act(() => {
      result.current.filters.setMany({ price: "free", date: "this-weekend", category: "Music" });
    });
    const params = new URLSearchParams(result.current.location.search);
    expect(params.get("price")).toBe("free");
    expect(params.get("date")).toBe("this-weekend");
    expect(params.get("category")).toBe("Music");
    expect(params.get("q")).toBe("jazz");
    expect(params.has("page")).toBe(false);
  });

  it("drops keys that equal their per-key default", () => {
    const { result } = setup("/events?price=free&category=Music");
    act(() => {
      result.current.filters.setMany(
        { price: "any-price", category: "all", date: "today" },
        { defaults: { price: "any-price", category: "all", date: "any-date" } }
      );
    });
    expect(result.current.location.search).toBe("?date=today");
  });

  it("still deletes empty values with no defaults given (Restaurants' call shape)", () => {
    const { result } = setup("/restaurants?cuisine=thai&tags=a,b");
    act(() => {
      result.current.filters.setMany({ cuisine: "", tags: [] });
    });
    expect(result.current.location.search).toBe("");
  });
});
