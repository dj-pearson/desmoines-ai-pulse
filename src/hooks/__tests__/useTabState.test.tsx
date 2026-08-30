import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useTabState } from "@/hooks/useTabState";

/**
 * WEB-UX-008 — the selected tab belongs in the URL, so it survives a remount,
 * a reload, or navigating away and back instead of snapping to the first tab.
 */
function wrapper(initialEntries: string[]) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
}

describe("useTabState", () => {
  it("falls back to the default tab when the URL says nothing", () => {
    const { result } = renderHook(() => useTabState("overview"), {
      wrapper: wrapper(["/dashboard"]),
    });
    expect(result.current[0]).toBe("overview");
  });

  it("reads the active tab from the URL", () => {
    const { result } = renderHook(() => useTabState("overview"), {
      wrapper: wrapper(["/dashboard?tab=advertise"]),
    });
    expect(result.current[0]).toBe("advertise");
  });

  it("writes the selected tab to the URL and drops the default again", () => {
    const { result } = renderHook(
      () => ({ tab: useTabState("overview"), location: useLocation() }),
      { wrapper: wrapper(["/dashboard"]) },
    );

    act(() => result.current.tab[1]("events"));
    expect(result.current.tab[0]).toBe("events");
    expect(result.current.location.search).toBe("?tab=events");

    // Back to the default: keep links clean rather than pinning ?tab=overview.
    act(() => result.current.tab[1]("overview"));
    expect(result.current.tab[0]).toBe("overview");
    expect(result.current.location.search).toBe("");
  });

  it("preserves unrelated query params", () => {
    const { result } = renderHook(
      () => ({ tab: useTabState("events"), location: useLocation() }),
      { wrapper: wrapper(["/admin/content?q=jazz"]) },
    );

    act(() => result.current.tab[1]("hotels"));
    const params = new URLSearchParams(result.current.location.search);
    expect(params.get("q")).toBe("jazz");
    expect(params.get("tab")).toBe("hotels");
  });

  it("ignores an unrecognised tab in the URL", () => {
    const { result } = renderHook(
      () => useTabState("overview", { validTabs: ["overview", "events"] }),
      { wrapper: wrapper(["/dashboard?tab=deleted-tab"]) },
    );
    expect(result.current[0]).toBe("overview");
  });

  it("keeps separate tab strips on their own params", () => {
    const { result } = renderHook(
      () => ({
        page: useTabState("pending"),
        nested: useTabState("a", { param: "creatives" }),
        location: useLocation(),
      }),
      { wrapper: wrapper(["/admin/campaigns/1"]) },
    );

    act(() => result.current.nested[1]("b"));
    expect(result.current.page[0]).toBe("pending");
    expect(result.current.nested[0]).toBe("b");
    expect(result.current.location.search).toBe("?creatives=b");
  });
});
