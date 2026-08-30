import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { useUrlFilterState } from "@/hooks/useUrlFilterState";

/**
 * WEB-UX-001 — URL is the source of truth for list filters. These cover the
 * read/write/serialize/clear behaviors the Events/Restaurants/Attractions
 * pages rely on (the back/forward + shareable-URL integration is covered by
 * the Playwright search-filters suite).
 */
function wrapper(initialEntries: string[]) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
}

describe("useUrlFilterState", () => {
  it("reads params from the URL with a fallback", () => {
    const { result } = renderHook(() => useUrlFilterState(), {
      wrapper: wrapper(["/events?q=jazz&category=Music"]),
    });
    expect(result.current.get("q")).toBe("jazz");
    expect(result.current.get("category", "all")).toBe("Music");
    expect(result.current.get("missing", "fallback")).toBe("fallback");
  });

  it("parses comma-separated multi-select params via getList", () => {
    const { result } = renderHook(() => useUrlFilterState(), {
      wrapper: wrapper(["/restaurants?cuisine=Thai,Italian"]),
    });
    expect(result.current.getList("cuisine")).toEqual(["Thai", "Italian"]);
    expect(result.current.getList("none")).toEqual([]);
  });

  it("writes params and omits values equal to their default", () => {
    const { result } = renderHook(() => useUrlFilterState(), {
      wrapper: wrapper(["/events"]),
    });
    act(() => {
      result.current.set(
        { category: "Music", sort: "date_asc" },
        { defaults: { category: "all", sort: "date_asc" } },
      );
    });
    expect(result.current.get("category")).toBe("Music");
    // sort equals its default → dropped from the URL.
    expect(result.current.params.get("sort")).toBeNull();
  });

  it("serializes arrays as comma-separated and treats empty/null as removal", () => {
    const { result } = renderHook(() => useUrlFilterState(), {
      wrapper: wrapper(["/restaurants?price=$$"]),
    });
    act(() => {
      result.current.set({ cuisine: ["Thai", "Sushi"], price: null });
    });
    expect(result.current.get("cuisine")).toBe("Thai,Sushi");
    expect(result.current.params.get("price")).toBeNull();
  });

  it("clear removes the given keys only", () => {
    const { result } = renderHook(() => useUrlFilterState(), {
      wrapper: wrapper(["/events?q=jazz&category=Music&page=2"]),
    });
    act(() => {
      result.current.clear(["q", "page"]);
    });
    expect(result.current.params.get("q")).toBeNull();
    expect(result.current.params.get("page")).toBeNull();
    expect(result.current.get("category")).toBe("Music");
  });
});
