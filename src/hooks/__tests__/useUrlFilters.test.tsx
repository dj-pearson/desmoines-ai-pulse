import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { useUrlFilters } from "@/hooks/useUrlFilters";

/**
 * WEB-UX-035. This is the hook /events, /attractions and now /playgrounds,
 * /articles and /deals actually use, and it had no test of its own. Its dead
 * twin useUrlFilterState had one - whose docblock claimed to cover "the
 * Events/Restaurants/Attractions pages" it was not wired into. That twin and
 * its suite are gone; these assertions cover the live hook instead.
 */
function wrapper(initialEntries: string[]) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
}

describe("useUrlFilters", () => {
  it("reads a param, falling back to the default", () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: wrapper(["/playgrounds?age=2-5"]),
    });
    expect(result.current.getStr("age", "all")).toBe("2-5");
    expect(result.current.getStr("location", "any-location")).toBe("any-location");
  });

  it("falls back when a numeric param is not a number", () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: wrapper(["/events?page=notanumber"]),
    });
    expect(result.current.getNum("page", 1)).toBe(1);
  });

  it("writes a param and reads it back", () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: wrapper(["/playgrounds"]),
    });
    act(() => result.current.setParam("age", "2-5", { def: "all" }));
    expect(result.current.getStr("age", "all")).toBe("2-5");
  });

  it("keeps the default value out of the URL", () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: wrapper(["/playgrounds?age=2-5"]),
    });
    act(() => result.current.setParam("age", "all", { def: "all" }));
    // Back at the default, so the param is gone rather than spelled out.
    expect(result.current.getStr("age", "all")).toBe("all");
  });

  it("resets pagination when a filter that narrows the set changes", () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: wrapper(["/events?page=4"]),
    });
    act(() => result.current.setParam("category", "music", { def: "all", resetsPage: true }));
    expect(result.current.getNum("page", 1)).toBe(1);
  });

  it("clears the listed filters and leaves everything else alone", () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: wrapper(["/playgrounds?q=swing&age=2-5&location=Ankeny&view=map"]),
    });
    act(() => result.current.clearParams(["q", "age", "location", "featured"]));
    expect(result.current.getStr("q", "")).toBe("");
    expect(result.current.getStr("age", "all")).toBe("all");
    expect(result.current.getStr("location", "any-location")).toBe("any-location");
    // Not a filter key, so Clear-all must not touch it.
    expect(result.current.getStr("view", "list")).toBe("map");
  });

  it("serializes a list param as a comma-separated value", () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: wrapper(["/events"]),
    });
    act(() => result.current.setParam("tags", ["free", "outdoor"]));
    expect(result.current.getList("tags")).toEqual(["free", "outdoor"]);
  });

  it("returns an empty list for a missing list param", () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: wrapper(["/events"]),
    });
    expect(result.current.getList("tags")).toEqual([]);
  });
});
